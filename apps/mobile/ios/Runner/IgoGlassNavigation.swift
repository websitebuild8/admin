import Flutter
import UIKit

final class IgoGlassNavigationFactory: NSObject, FlutterPlatformViewFactory {
  private let messenger: FlutterBinaryMessenger
  init(messenger: FlutterBinaryMessenger) { self.messenger = messenger }
  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol { FlutterStandardMessageCodec.sharedInstance() }
  func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?) -> FlutterPlatformView {
    IgoGlassNavigation(frame: frame, viewId: viewId, args: args, messenger: messenger)
  }
}
final class IgoGlassNavigation: NSObject, FlutterPlatformView {
  private let container: UIVisualEffectView
  private let stack = UIStackView()
  private let channel: FlutterMethodChannel
  private var selected: Int = 0
  private var labels: [String] = []
  private var observer: NSObjectProtocol?
  init(frame: CGRect, viewId: Int64, args: Any?, messenger: FlutterBinaryMessenger) {
    container = UIVisualEffectView(effect: nil)
    channel = FlutterMethodChannel(name: "igo/glass-navigation/\(viewId)", binaryMessenger: messenger)
    super.init()
    container.frame = frame
    // Match Flutter's white/yellow light theme even when iOS uses dark mode.
    container.overrideUserInterfaceStyle = .light
    container.layer.cornerRadius = 28
    container.layer.cornerCurve = .continuous
    container.clipsToBounds = true
    stack.axis = .horizontal
    stack.distribution = .fillEqually
    stack.spacing = 4
    stack.translatesAutoresizingMaskIntoConstraints = false
    container.contentView.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: container.contentView.leadingAnchor, constant: 8),
      stack.trailingAnchor.constraint(equalTo: container.contentView.trailingAnchor, constant: -8),
      stack.topAnchor.constraint(equalTo: container.contentView.topAnchor, constant: 7),
      stack.bottomAnchor.constraint(equalTo: container.contentView.bottomAnchor, constant: -7)
    ])
    configureEffect()
    update(args)
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "update" { self?.update(call.arguments); result(nil) }
      else { result(FlutterMethodNotImplemented) }
    }
    observer = NotificationCenter.default.addObserver(forName: UIAccessibility.reduceTransparencyStatusDidChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.configureEffect() }
  }
  private func configureEffect() {
    if UIAccessibility.isReduceTransparencyEnabled {
      container.effect = nil
      container.backgroundColor = UIColor(red: 1, green: 0.95, blue: 0.67, alpha: 1)
    } else {
      container.backgroundColor = UIColor(red: 1, green: 0.875, blue: 0.208, alpha: 0.16)
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) {
        let effect = UIGlassEffect(style: .regular)
        effect.tintColor = UIColor(red: 1, green: 0.875, blue: 0.208, alpha: 0.26)
        effect.isInteractive = !UIAccessibility.isReduceMotionEnabled
        container.effect = effect
      } else { container.effect = UIBlurEffect(style: .systemMaterial) }
      #else
      container.effect = UIBlurEffect(style: .systemMaterial)
      #endif
    }
  }
  private func update(_ args: Any?) {
    guard let values = args as? [String: Any] else { return }
    configureEffect()
    labels = values["labels"] as? [String] ?? labels
    selected = values["selected"] as? Int ?? selected
    stack.arrangedSubviews.forEach { stack.removeArrangedSubview($0); $0.removeFromSuperview() }
    for (index, label) in labels.enumerated() {
      let button = UIButton(type: .system)
      button.tag = index
      var config = UIButton.Configuration.plain()
      config.title = label
      let symbols = ["Home": "house", "Search": "magnifyingglass", "Kitchen": "building.2", "Menu": "fork.knife", "Map": "map", "Account": "person.crop.circle"]
      config.image = UIImage(systemName: symbols[label] ?? "list.bullet.rectangle")
      config.imagePlacement = .top
      config.imagePadding = 2
      config.baseForegroundColor = UIColor(red: 0.094, green: 0.098, blue: 0.094, alpha: 1)
      config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
        var attributes = attributes
        attributes.font = UIFont.preferredFont(forTextStyle: .caption1)
        return attributes
      }
      config.background.backgroundColor = index == selected ? UIColor.white.withAlphaComponent(UIAccessibility.isReduceTransparencyEnabled ? 1 : 0.67) : .clear
      config.background.cornerRadius = 22
      button.configuration = config
      button.accessibilityLabel = label
      button.accessibilityTraits = index == selected ? [.button, .selected] : .button
      button.addTarget(self, action: #selector(selectTab(_:)), for: .touchUpInside)
      stack.addArrangedSubview(button)
    }
  }
  @objc private func selectTab(_ sender: UIButton) { channel.invokeMethod("select", arguments: sender.tag) }
  func view() -> UIView { container }
  deinit { channel.setMethodCallHandler(nil); if let observer { NotificationCenter.default.removeObserver(observer) } }
}
