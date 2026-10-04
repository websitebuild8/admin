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
  test('Entrance details reject missing buildings and mismatched islands', () {
    expect(
      () => PreviewAddress(
        area: 'Malé',
        building: '  ',
        point: const GeoPoint(4.1755, 73.5093),
      ),
      throwsArgumentError,
    );
    for (final invalid in [
      const GeoPoint(4.216, 73.541),
      const GeoPoint(double.nan, 73.5093),
      const GeoPoint(91, 73.5093),
      const GeoPoint(4.1755, double.infinity),
    ]) {
      expect(
        () => PreviewAddress(area: 'Malé', building: 'Home', point: invalid),
        throwsArgumentError,
      );
    }
    expect(
      () => PreviewAddress(
        area: 'Addu',
        building: 'Home',
        point: const GeoPoint(4.1755, 73.5093),
      ),
      throwsArgumentError,
    );
  });
  test(
    'Address snapshots keep the original entrance when the cart is edited',
    () {
      final original = PreviewAddress(
        area: 'Malé',
        building: ' Sample home ',
        unit: ' 2A ',
        instructions: ' Side entrance ',
        point: const GeoPoint(4.1755, 73.5093),
      );
      final cart = Cart()..deliveryAddress = original;
      final snapshot = cart.deliveryAddress!.toJson();
      cart.deliveryAddress = PreviewAddress(
        area: 'Hulhumalé',
        building: 'Another home',
        point: const GeoPoint(4.216, 73.541),
      );
      expect(snapshot['building'], 'Sample home');
      expect(snapshot['unit'], '2A');
      expect(snapshot['instructions'], 'Side entrance');
      expect(snapshot['latitude'], 4.1755);
      expect(
        original.point.navigation.queryParameters['destination'],
        '4.1755,73.5093',
      );
      expect(cart.deliveryAddress!.area, 'Hulhumalé');
    },
  );
  testWidgets('An address cannot be saved without a confirmed entrance', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: AddressPage(
          area: 'Malé',
          mapBuilder: (_, _, _, _) => const SizedBox(height: 40),
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('address-building')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const ValueKey('address-building')),
      'Home',
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('save-address')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('save-address')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('entrance-error')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('Confirm your building entrance pin first.'),
      findsOneWidget,
    );
    expect(find.byType(AddressPage), findsOneWidget);
  });
  testWidgets('Changing the island clears a previously confirmed entrance', (
    tester,
  ) async {
    final initial = PreviewAddress(
      area: 'Malé',
      building: 'Sample home',
      point: const GeoPoint(4.1755, 73.5093),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: AddressPage(
          area: 'Malé',
          initial: initial,
          mapBuilder: (_, _, _, _) => const SizedBox(height: 40),
        ),
      ),
    );
    expect(find.textContaining('Entrance confirmed'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('address-area')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hulhumalé').last);
    await tester.pumpAndSettle();
    expect(
      find.text('An entrance pin has not been confirmed.'),
      findsOneWidget,
    );
  });
  testWidgets('Moving a confirmed pin requires fresh confirmation', (
    tester,
  ) async {
    final initial = PreviewAddress(
      area: 'Malé',
      building: 'Sample home',
      point: const GeoPoint(4.1755, 73.5093),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: AddressPage(
          area: 'Malé',
          initial: initial,
          mapBuilder: (_, _, _, onMoved) => TextButton(
            onPressed: () => onMoved(const GeoPoint(4.176, 73.510)),
            child: const Text('Move map'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Move map'));
    await tester.pumpAndSettle();
    expect(
      find.text('Pin moved. Confirm your entrance again.'),
      findsOneWidget,
    );
    expect(
      find.text('An entrance pin has not been confirmed.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'Manual coordinates validate the island and return a full address',
    (tester) async {
      PreviewAddress? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: FilledButton(
                onPressed: () async {
                  result = await Navigator.push<PreviewAddress>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AddressPage(
                        area: 'Malé',
                        mapBuilder: (_, _, _, _) => const SizedBox(height: 40),
                      ),
                    ),
                  );
                },
                child: const Text('Choose address'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Choose address'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Have entrance coordinates?'),
        160,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Have entrance coordinates?'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('address-longitude')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('address-latitude')),
        '4.216',
      );
      await tester.enterText(
        find.byKey(const ValueKey('address-longitude')),
        '73.541',
      );
      await tester.ensureVisible(find.byKey(const ValueKey('use-coordinates')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('use-coordinates')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('entrance-error')),
        -180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Choose an entrance in Malé.'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('address-latitude')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('address-latitude')),
        '4.1755',
      );
      await tester.enterText(
        find.byKey(const ValueKey('address-longitude')),
        '73.5093',
      );
      await tester.ensureVisible(find.byKey(const ValueKey('use-coordinates')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('use-coordinates')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('address-building')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('address-building')),
        'Sample home',
      );
      await tester.enterText(find.byKey(const ValueKey('address-unit')), '2A');
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('address-instructions')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('address-instructions')),
        'Side door',
      );
      await tester.ensureVisible(find.byKey(const ValueKey('save-address')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-address')));
      await tester.pumpAndSettle();
      expect(result?.area, 'Malé');
      expect(result?.building, 'Sample home');
      expect(result?.unit, '2A');
      expect(result?.instructions, 'Side door');
      expect(result?.point.latitude, 4.1755);
      expect(find.byType(AddressPage), findsNothing);
    },
  );
  testWidgets('Checkout reuses the customer entrance kept in the cart', (
    tester,
  ) async {
    final cart = Cart()
      ..change(0, 1)
      ..deliveryAddress = PreviewAddress(
        area: 'Hulhumalé',
        building: 'Sample home',
        unit: '2A',
        point: const GeoPoint(4.216, 73.541),
      );
    await tester.pumpWidget(MaterialApp(home: Checkout(cart: cart)));
    expect(find.text('Sample home · 2A · Hulhumalé'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining('Confirmed entrance:'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('Confirmed entrance: 4.216000, 73.541000'),
      findsOneWidget,
    );
  });
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
