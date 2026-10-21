import AVFoundation
import Capacitor
import Foundation
import MediaPlayer
import UIKit

/// Native narration for the App Store build.
///
/// The web layer hands over a queue of sentences (the rest of the book) and this
/// plugin speaks them with AVSpeechSynthesizer on a `.playback` audio session, so
/// narration continues with the screen locked or the app in the background, and
/// can be controlled from the Lock Screen, Control Center and headphones.
/// Everything runs on-device; no network is used.
@objc(NativeSpeechPlugin)
public class NativeSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "NativeSpeechPlugin"
    public let jsName = "NativeSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVoices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speakSequence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSleepTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSavedPosition", returnType: CAPPluginReturnPromise),
    ]

    private struct Item {
        let text: String
        let chapter: Int
        let start: Int
    }

    private let synth = AVSpeechSynthesizer()
    private var items: [Item] = []
    private var chapterTitles: [String] = []
    private var key = ""
    private var seq = 0
    private var index = 0
    private var currentUtterance: AVSpeechUtterance?
    private var voice: AVSpeechSynthesisVoice?
    private var rate: Float = AVSpeechUtteranceDefaultSpeechRate
    private var pitch: Float = 1
    private var lastOffset = 0
    private var lastSave = Date.distantPast

    private var sleepTimer: Timer?
    private var stopAtChapterEnd = false

    private var nowPlaying: [String: Any] = [:]
    private var remoteConfigured = false

    private static let positionKey = "mylibrary.lastPosition"

    override public func load() {
        synth.delegate = self
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance())
    }

    // MARK: - JS API

    @objc func getVoices(_ call: CAPPluginCall) {
        let voices = AVSpeechSynthesisVoice.speechVoices().map { v -> [String: Any] in
            var quality = "standard"
            if #available(iOS 16.0, *), v.quality == .premium { quality = "premium" }
            else if v.quality == .enhanced { quality = "enhanced" }
            if #available(iOS 17.0, *), v.voiceTraits.contains(.isNoveltyVoice) { quality = "novelty" }
            return ["id": v.identifier, "name": v.name, "lang": v.language, "quality": quality]
        }
        call.resolve(["voices": voices])
    }

    /// items: [{ text, chapter, start }], plus voiceId, rate, pitch, key, chapterTitles.
    @objc func speakSequence(_ call: CAPPluginCall) {
        guard let raw = call.getArray("items", JSObject.self) else {
            call.reject("items is required")
            return
        }
        let parsed = raw.compactMap { o -> Item? in
            guard let text = o["text"] as? String else { return nil }
            let chapter = (o["chapter"] as? NSNumber)?.intValue ?? 0
            let start = (o["start"] as? NSNumber)?.intValue ?? 0
            return Item(text: text, chapter: chapter, start: start)
        }
        let voiceId = call.getString("voiceId")
        let webRate = Float(call.getDouble("rate") ?? 1)
        let webPitch = Float(call.getDouble("pitch") ?? 1)
        let newKey = call.getString("key") ?? ""
        let titles = call.getArray("chapterTitles", String.self) ?? []
        let sequenceId = call.getInt("seq") ?? 0

        DispatchQueue.main.async {
            self.stopSpeaking()
            self.items = parsed
            self.key = newKey
            self.chapterTitles = titles
            self.seq = sequenceId
            self.index = 0
            self.voice = voiceId.flatMap { AVSpeechSynthesisVoice(identifier: $0) }
            self.rate = Self.mapRate(webRate)
            self.pitch = min(2, max(0.5, webPitch))
            self.activateSession()
            self.configureRemoteCommands()
            self.speakCurrent()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopSpeaking()
            self.savePosition(force: true)
            self.updateNowPlayingRate(0)
            call.resolve()
        }
    }

    /// minutes > 0 → stop after that time; chapterEnd → stop when the chapter ends; otherwise off.
    @objc func setSleepTimer(_ call: CAPPluginCall) {
        let minutes = call.getDouble("minutes") ?? 0
        let chapterEnd = call.getBool("chapterEnd") ?? false
        DispatchQueue.main.async {
            self.sleepTimer?.invalidate()
            self.sleepTimer = nil
            self.stopAtChapterEnd = chapterEnd
            if minutes > 0 {
                self.sleepTimer = Timer.scheduledTimer(withTimeInterval: minutes * 60, repeats: false) { [weak self] _ in
                    guard let self = self else { return }
                    self.sleepTimer = nil
                    self.pauseForSleep()
                }
            }
            call.resolve()
        }
    }

    /// title, artist, artwork (data URL).
    @objc func setNowPlaying(_ call: CAPPluginCall) {
        var info: [String: Any] = [:]
        info[MPMediaItemPropertyAlbumTitle] = call.getString("title") ?? ""
        info[MPMediaItemPropertyArtist] = call.getString("artist") ?? ""
        if let dataUrl = call.getString("artwork"),
           let comma = dataUrl.firstIndex(of: ","),
           let data = Data(base64Encoded: String(dataUrl[dataUrl.index(after: comma)...])),
           let image = UIImage(data: data) {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }
        DispatchQueue.main.async {
            self.nowPlaying = info
            self.publishNowPlaying()
            call.resolve()
        }
    }

    /// Last position saved natively (survives the app being closed in the background).
    @objc func getSavedPosition(_ call: CAPPluginCall) {
        let wanted = call.getString("key") ?? ""
        guard let saved = UserDefaults.standard.dictionary(forKey: Self.positionKey),
              (saved["key"] as? String) == wanted else {
            call.resolve([:])
            return
        }
        call.resolve([
            "chapter": saved["chapter"] as? Int ?? 0,
            "offset": saved["offset"] as? Int ?? 0,
            "updatedAt": saved["updatedAt"] as? Double ?? 0,
        ])
    }

    // MARK: - Playback

    private static func mapRate(_ web: Float) -> Float {
        // Web speed 1× ≈ iOS default rate; 3× ≈ close to the iOS maximum.
        let def = AVSpeechUtteranceDefaultSpeechRate
        let r: Float
        if web <= 1 { r = def * web } else { r = def + (AVSpeechUtteranceMaximumSpeechRate - def) * min(1, (web - 1) / 2.5) }
        return max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, r))
    }

    private func speakCurrent() {
        guard index < items.count else {
            currentUtterance = nil
            updateNowPlayingRate(0)
            emit(["type": "done"])
            return
        }
        let item = items[index]
        let u = AVSpeechUtterance(string: item.text)
        u.voice = voice ?? AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())
        u.rate = rate
        u.pitchMultiplier = pitch
        u.postUtteranceDelay = 0.05
        currentUtterance = u
        lastOffset = item.start
        synth.speak(u)
    }

    private func stopSpeaking() {
        currentUtterance = nil
        if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
    }

    private func jump(to newIndex: Int) {
        guard newIndex >= 0, newIndex < items.count else { return }
        stopSpeaking()
        index = newIndex
        speakCurrent()
    }

    private func pauseForSleep() {
        synth.pauseSpeaking(at: .word)
        stopAtChapterEnd = false
        savePosition(force: true)
        updateNowPlayingRate(0)
        emit(["type": "paused", "reason": "sleep"])
    }

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [])
        try? session.setActive(true)
    }

    private func emit(_ data: [String: Any]) {
        var d = data
        d["seq"] = seq
        notifyListeners("event", data: d)
    }

    private func savePosition(force: Bool = false) {
        guard !key.isEmpty, index < items.count || force else { return }
        let now = Date()
        if !force && now.timeIntervalSince(lastSave) < 2 { return }
        lastSave = now
        let chapter = index < items.count ? items[index].chapter : (items.last?.chapter ?? 0)
        UserDefaults.standard.set(
            ["key": key, "chapter": chapter, "offset": lastOffset, "updatedAt": now.timeIntervalSince1970 * 1000],
            forKey: Self.positionKey)
    }

    // MARK: - AVSpeechSynthesizerDelegate

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        emit(["type": "itemStart", "index": index])
        savePosition()
        publishNowPlaying()
        updateNowPlayingRate(1)
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance, index < items.count else { return }
        // NSRange is in UTF-16 units, the same units JavaScript strings use.
        lastOffset = items[index].start + characterRange.location
        emit(["type": "boundary", "index": index, "charIndex": characterRange.location])
        savePosition()
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        let finishedChapter = items[index].chapter
        index += 1
        if index < items.count { lastOffset = items[index].start }
        if stopAtChapterEnd, index < items.count, items[index].chapter != finishedChapter {
            stopAtChapterEnd = false
            currentUtterance = nil
                savePosition(force: true)
            updateNowPlayingRate(0)
            emit(["type": "itemStart", "index": index])
            emit(["type": "paused", "reason": "sleep-chapter"])
            return
        }
        speakCurrent()
    }

    // MARK: - Interruptions (calls, Siri, alarms)

    @objc private func handleInterruption(_ note: Notification) {
        guard let info = note.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
        DispatchQueue.main.async {
            switch type {
            case .began:
                guard self.currentUtterance != nil else { return }
                self.synth.pauseSpeaking(at: .immediate)
                self.savePosition(force: true)
                self.updateNowPlayingRate(0)
                self.emit(["type": "paused", "reason": "interrupted"])
            case .ended:
                let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                if AVAudioSession.InterruptionOptions(rawValue: optionsValue).contains(.shouldResume), self.synth.isPaused {
                    self.activateSession()
                    self.synth.continueSpeaking()
                    self.updateNowPlayingRate(1)
                    self.emit(["type": "resumed"])
                }
            @unknown default:
                break
            }
        }
    }

    // MARK: - Lock Screen / Control Center / headphones

    private func configureRemoteCommands() {
        guard !remoteConfigured else { return }
        remoteConfigured = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.remotePlay() ?? .commandFailed }
        c.pauseCommand.addTarget { [weak self] _ in self?.remotePause() ?? .commandFailed }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            return self.synth.isSpeaking && !self.synth.isPaused ? self.remotePause() : self.remotePlay()
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            guard let self = self, self.index < self.items.count else { return .commandFailed }
            let chapter = self.items[self.index].chapter
            guard let next = self.items.firstIndex(where: { $0.chapter > chapter }) else { return .noSuchContent }
            self.jump(to: next)
            return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self = self, !self.items.isEmpty else { return .commandFailed }
            let i = min(self.index, self.items.count - 1)
            let chapter = self.items[i].chapter
            let startOfChapter = self.items.firstIndex(where: { $0.chapter == chapter }) ?? 0
            // Restart the chapter, or go to the previous one if we're at its start.
            if i - startOfChapter > 1 || chapter == self.items[0].chapter {
                self.jump(to: startOfChapter)
            } else {
                let prev = self.items.firstIndex(where: { $0.chapter == chapter - 1 }) ?? 0
                self.jump(to: prev)
            }
            return .success
        }
        c.skipForwardCommand.isEnabled = false
        c.skipBackwardCommand.isEnabled = false
    }

    private func remotePlay() -> MPRemoteCommandHandlerStatus {
        if synth.isPaused {
            activateSession()
            synth.continueSpeaking()
        } else if currentUtterance == nil, index < items.count {
            activateSession()
            speakCurrent()
        } else {
            return .noActionableNowPlayingItem
        }
        updateNowPlayingRate(1)
        emit(["type": "resumed"])
        return .success
    }

    private func remotePause() -> MPRemoteCommandHandlerStatus {
        guard synth.isSpeaking else { return .noActionableNowPlayingItem }
        synth.pauseSpeaking(at: .word)
        savePosition(force: true)
        updateNowPlayingRate(0)
        emit(["type": "paused", "reason": "remote"])
        return .success
    }

    private func publishNowPlaying() {
        var info = nowPlaying
        if index < items.count, items[index].chapter < chapterTitles.count {
            info[MPMediaItemPropertyTitle] = chapterTitles[items[index].chapter]
        } else if info[MPMediaItemPropertyTitle] == nil {
            info[MPMediaItemPropertyTitle] = info[MPMediaItemPropertyAlbumTitle]
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = synth.isSpeaking && !synth.isPaused ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func updateNowPlayingRate(_ rate: Double) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? nowPlaying
        info[MPNowPlayingInfoPropertyPlaybackRate] = rate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
