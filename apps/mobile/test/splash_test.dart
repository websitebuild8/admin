import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:igo_mobile/main.dart';
import 'package:igo_mobile/splash.dart';

void main() {
  testWidgets('Splash advances once and safely disposes its timer', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: SplashPage(next: Scaffold(body: Text('Welcome destination'))),
      ),
    );
    expect(find.byType(IgoSplashArtwork), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    expect(find.text('Welcome destination'), findsOneWidget);
    expect(find.byType(IgoSplashArtwork), findsNothing);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Welcome destination'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(
      const MaterialApp(
        home: SplashPage(next: Scaffold(body: Text('Unreachable'))),
      ),
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Compact splash supports enlarged text and reduced effects', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(
            size: Size(320, 568),
            textScaler: TextScaler.linear(2),
            highContrast: true,
            disableAnimations: true,
          ),
          child: Scaffold(body: IgoSplashArtwork()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('A little closer to good.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
