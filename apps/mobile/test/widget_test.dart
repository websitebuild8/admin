import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:igo_mobile/main.dart';
import 'package:igo_mobile/models.dart';

void main() {
  test('Cart totals use integer laari and remove empty lines', () {
    final cart = Cart();
    expect(cart.total, 0);
    cart.change(0, 2);
    cart.change(1, 1);
    expect(cart.total, 17500);
    cart.change(0, -2);
    cart.change(1, -1);
    expect(cart.total, 0);
    expect(cart.quantities, isEmpty);
  });
  test(
    'Navigation has destination but no collected rider origin or API key',
    () {
      final uri = directions(4.1755, 73.5093);
      expect(uri.host, 'www.google.com');
      expect(uri.queryParameters['destination'], '4.1755,73.5093');
      expect(uri.queryParameters.containsKey('origin'), false);
      expect(uri.queryParameters.containsKey('key'), false);
      expect(() => directions(double.nan, 73), throwsArgumentError);
    },
  );
  testWidgets('Default app cannot self-authorize a restaurant role', (
    tester,
  ) async {
    await tester.pumpWidget(const IgoApp(preview: false));
    await tester.scrollUntilVisible(find.text('Get started'), 250);
    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My restaurant'));
    await tester.pumpAndSettle();
    expect(find.text('Registration coming next'), findsOneWidget);
    expect(find.text('Kitchen orders'), findsNothing);
  });
  testWidgets('Checkout never submits or charges a preview order', (
    tester,
  ) async {
    final cart = Cart()..change(0, 1);
    await tester.pumpWidget(MaterialApp(home: Checkout(cart: cart)));
    await tester.scrollUntilVisible(
      find.text('Payments not connected yet'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Payments not connected yet'),
    );
    expect(button.onPressed, isNull);
  });
  testWidgets('Role previews fit a narrow mobile screen', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final role in AppRole.values) {
      await tester.pumpWidget(
        MaterialApp(
          home: Workspace(key: ValueKey(role), role: role),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(ListView).first, const Offset(0, -450));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
  });
}
