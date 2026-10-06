import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:igo_mobile/delivery_widgets.dart';
import 'package:igo_mobile/main.dart';
import 'package:igo_mobile/models.dart';

void main() {
  testWidgets(
    'Restaurant preview saves, marks sold out and deletes a menu item',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(home: Workspace(role: AppRole.restaurant)),
      );
      await tester.tap(find.text('Menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add menu item'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('menu-name')),
        'Fresh juice',
      );
      await tester.enterText(
        find.byKey(const ValueKey('menu-category')),
        'Drinks',
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('menu-price')),
        160,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byKey(const ValueKey('menu-price')), '25.75');
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Fresh juice'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('MVR 25.75'), findsOneWidget);
      final tile = find.ancestor(
        of: find.text('Fresh juice'),
        matching: find.byType(MenuItemTile),
      );
      await tester.ensureVisible(tile);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(of: tile, matching: find.byType(Switch)),
      );
      await tester.pumpAndSettle();
      expect(
        find.descendant(of: tile, matching: find.text('Out of stock')),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Edit Fresh juice'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Delete item'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Delete item'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Delete item'));
      await tester.pumpAndSettle();
      expect(find.text('Fresh juice'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Menu editor refuses invalid prices and preserves integer money',
    (tester) async {
      Map<String, dynamic>? saved;
      await tester.pumpWidget(
        MaterialApp(home: MenuEditorPage(onSave: (v) async => saved = v)),
      );
      await tester.enterText(find.byKey(const ValueKey('menu-name')), 'Cake');
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('menu-price')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byKey(const ValueKey('menu-price')),
        '25.759',
      );
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      expect(saved, isNull);
      expect(
        find.text('Enter MVR 1–10,000, up to 2 decimals.'),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const ValueKey('menu-price')), '25.75');
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      expect(saved?['price'], 2575);
    },
  );
  test(
    'Order presentation never treats rider assignment as food picked up',
    () {
      expect(deliveryStage('Awaiting confirmation', 'Order assigned', true), 0);
      expect(deliveryStage('Order confirmed', 'Order assigned', true), 1);
      expect(
        deliveryStage('Ready for pickup', 'Arrived at restaurant', true),
        1,
      );
      expect(deliveryStage('Order picked up', 'Order picked up', true), 2);
      expect(deliveryStage('Order picked up', 'Arrived at customer', true), 3);
      expect(deliveryStage('Order picked up', 'Delivery complete', true), 4);
    },
  );
  testWidgets(
    'Customer status receives new milestones while the page is open',
    (tester) async {
      final order = <String, dynamic>{
        'id': 'sample',
        'publicId': 'SAMPLE-001',
        'restaurant': 'The Cafe',
        'preparation': 'Order confirmed',
        'delivery': 'Order assigned',
        'items': 'Coffee',
        'amount': 4500,
        'events': <dynamic>[],
        'estimatedDelivery': 'About 25–35 min',
      };
      final feed = ValueNotifier<List<Map<String, dynamic>>>([order]);
      await tester.pumpWidget(
        MaterialApp(
          home: OrderDetailPage(order: order, feed: feed, onHelp: () {}),
        ),
      );
      expect(find.text('Your kitchen is on it.'), findsOneWidget);
      feed.value = [
        {
          ...order,
          'preparation': 'Order picked up',
          'delivery': 'Arrived at customer',
        },
      ];
      await tester.pumpAndSettle();
      expect(find.text('Your rider has arrived.'), findsOneWidget);
      expect(find.text('Your kitchen is on it.'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      feed.dispose();
      expect(tester.takeException(), isNull);
    },
  );
}
