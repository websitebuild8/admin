import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let defines = Bundle.main.object(forInfoDictionaryKey: "IGODartDefines") as? String ?? ""
    for encoded in defines.split(separator: ",") {
      if let data = Data(base64Encoded: String(encoded)),
         let value = String(data: data, encoding: .utf8),
         value.hasPrefix("GOOGLE_MAPS_API_KEY=") {
        let key = String(value.dropFirst("GOOGLE_MAPS_API_KEY=".count))
        if !key.isEmpty { GMSServices.provideAPIKey(key) }
      }
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "IgoGlassNavigation") {
      registrar.register(IgoGlassNavigationFactory(messenger: registrar.messenger()), withId: "igo/glass-navigation")
    }
  }
}
