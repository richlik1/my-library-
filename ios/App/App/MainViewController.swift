import Capacitor
import UIKit

/// Capacitor bridge view controller that registers the app's own native plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSpeechPlugin())
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
