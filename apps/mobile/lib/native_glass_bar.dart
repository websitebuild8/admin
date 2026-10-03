import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// iOS renders UIGlassEffect on iOS 26+; older devices and Android use the
/// accessible Flutter control. The native view contains navigation controls
/// only, keeping blur/platform-view work out of scrolling content.
class NativeGlassBar extends StatefulWidget {
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;
  const NativeGlassBar({
    super.key,
    required this.labels,
    required this.selected,
    required this.onSelected,
  });
  @override
  State<NativeGlassBar> createState() => _NativeGlassBarState();
}

class _NativeGlassBarState extends State<NativeGlassBar> {
  MethodChannel? channel;
  bool get native => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
  @override
  void didUpdateWidget(covariant NativeGlassBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (native) {
      channel?.invokeMethod<void>('update', {
        'selected': widget.selected,
        'labels': widget.labels,
      });
    }
  }

  @override
  void dispose() {
    channel?.setMethodCallHandler(null);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (native) {
      return SizedBox(
        height: 64,
        child: UiKitView(
          viewType: 'igo/glass-navigation',
          creationParams: {
            'selected': widget.selected,
            'labels': widget.labels,
          },
          creationParamsCodec: const StandardMessageCodec(),
          onPlatformViewCreated: (id) {
            channel = MethodChannel('igo/glass-navigation/$id');
            channel!.setMethodCallHandler((call) async {
              if (call.method == 'select' && call.arguments is int) {
                final index = call.arguments as int;
                if (index >= 0 && index < widget.labels.length) {
                  widget.onSelected(index);
                }
              }
            });
          },
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: NavigationBar(
        backgroundColor: Colors.white.withValues(alpha: .94),
        indicatorColor: const Color(0xFFFFDF35),
        selectedIndex: widget.selected,
        onDestinationSelected: widget.onSelected,
        height: 70,
        destinations: [
          for (var i = 0; i < widget.labels.length; i++)
            NavigationDestination(
              icon: Icon(
                [
                  Icons.home_outlined,
                  Icons.receipt_long_outlined,
                  Icons.person_outline,
                ][i],
              ),
              label: widget.labels[i],
            ),
        ],
      ),
    );
  }
}
