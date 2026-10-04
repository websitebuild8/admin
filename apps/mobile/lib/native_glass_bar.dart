import 'dart:ui';

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
        height: 74,
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
    final reduced =
        MediaQuery.of(context).highContrast ||
        MediaQuery.of(context).disableAnimations;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14181918),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: reduced ? 0 : 24,
            sigmaY: reduced ? 0 : 24,
          ),
          child: Container(
            height: 74,
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: reduced
                  ? const Color(0xFFFFF2AA)
                  : const Color(0xFFFFDF35).withValues(alpha: .26),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(color: Colors.white.withValues(alpha: .8)),
            ),
            child: Row(
              children: [
                for (var i = 0; i < widget.labels.length; i++)
                  Expanded(
                    child: Semantics(
                      selected: widget.selected == i,
                      button: true,
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(24),
                          onTap: () => widget.onSelected(i),
                          child: AnimatedContainer(
                            duration: reduced
                                ? Duration.zero
                                : const Duration(milliseconds: 180),
                            decoration: BoxDecoration(
                              color: widget.selected == i
                                  ? Colors.white.withValues(
                                      alpha: reduced ? 1 : .67,
                                    )
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    [
                                      Icons.home_outlined,
                                      Icons.receipt_long_outlined,
                                      Icons.person_outline,
                                    ][i],
                                    size: 23,
                                    color: const Color(0xFF181918),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    widget.labels[i],
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF181918),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
