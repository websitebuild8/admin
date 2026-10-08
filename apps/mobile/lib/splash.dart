import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A quiet pearl backdrop with a compact, unchanged iGO logo in frosted glass.
/// The reflections are static, so the launch screen needs no animation loop.
class IgoSplashArtwork extends StatelessWidget {
  const IgoSplashArtwork({super.key});

  @override
  Widget build(BuildContext context) {
    final opaque =
        MediaQuery.highContrastOf(context) ||
        MediaQuery.disableAnimationsOf(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: Color(0xFFF7F8F5),
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF7F8F5), Colors.white, Color(0xFFF8F6ED)],
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (!opaque) ...[
              const Positioned(
                top: 100,
                left: -150,
                child: _PearlGlow(size: 360, color: Color(0xFFF7EDBA)),
              ),
              const Positioned(
                bottom: 100,
                right: -130,
                child: _PearlGlow(size: 320, color: Color(0xFFF4EACC)),
              ),
            ],
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  children: [
                    Expanded(
                      child: Center(
                        child: SingleChildScrollView(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(48),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x0C35362C),
                                      blurRadius: 40,
                                      offset: Offset(0, 18),
                                    ),
                                  ],
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(48),
                                  child: BackdropFilter(
                                    filter: ImageFilter.blur(
                                      sigmaX: opaque ? 0 : 18,
                                      sigmaY: opaque ? 0 : 18,
                                    ),
                                    child: Container(
                                      padding: const EdgeInsets.all(24),
                                      decoration: BoxDecoration(
                                        color: opaque ? Colors.white : null,
                                        gradient: opaque
                                            ? null
                                            : const LinearGradient(
                                                begin: Alignment.topLeft,
                                                end: Alignment.bottomRight,
                                                colors: [
                                                  Color(0xEFFFFFFF),
                                                  Color(0x66FFFFFF),
                                                ],
                                              ),
                                        borderRadius: BorderRadius.circular(48),
                                        border: Border.all(
                                          color: Colors.white,
                                          width: 1.5,
                                        ),
                                      ),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(34),
                                        child: Image.asset(
                                          'assets/brand/igo-logo.jpg',
                                          width: 152,
                                          height: 152,
                                          semanticLabel:
                                              'iGO. You Order. I Go.',
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 30),
                              const Text(
                                'A little closer to good.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Color(0xFF181918),
                                  fontSize: 19,
                                  letterSpacing: -.3,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.only(bottom: 30, top: 20),
                      child: Text(
                        'MALÉ  +  HULHUMALÉ',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Color(0xFF72756F),
                          fontSize: 10,
                          letterSpacing: 2,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PearlGlow extends StatelessWidget {
  final double size;
  final Color color;
  const _PearlGlow({required this.size, required this.color});

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          colors: [color.withValues(alpha: .55), color.withValues(alpha: 0)],
        ),
      ),
    ),
  );
}
