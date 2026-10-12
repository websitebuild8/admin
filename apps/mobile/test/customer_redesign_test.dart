import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:igo_mobile/customer_widgets.dart';
import 'package:igo_mobile/live_app.dart';
import 'package:igo_mobile/main.dart';
import 'package:igo_mobile/mobile_api.dart';
import 'package:igo_mobile/models.dart';

const capturePreviews = bool.fromEnvironment('IGO_CAPTURE_PREVIEWS');
const fontDirectory = String.fromEnvironment('IGO_PREVIEW_FONT_DIR');

void main() {
  setUpAll(() async {
    if (!capturePreviews) return;
    // Optional local exports use actual app widgets, with the SDK's licensed
    // Roboto and the icon fonts bundled in the app, instead of test-only Ahem.
    final fonts =
        jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
    for (final entry in fonts) {
      final loader = FontLoader(entry['family']);
      for (final face in entry['fonts']) {
        loader.addFont(rootBundle.load(face['asset']));
      }
      await loader.load();
    }
    final roboto = FontLoader('Roboto');
    for (final name in ['Regular', 'Medium', 'Bold', 'Black']) {
      roboto.addFont(
        File('$fontDirectory/Roboto-$name.ttf')
            .readAsBytes()
            .then((bytes) => ByteData.sublistView(bytes)),
      );
    }
    await roboto.load();
  });

  Future<void> capture(WidgetTester tester, GlobalKey key, String name) async {
    if (!capturePreviews) return;
    await tester.runAsync(
      () => precacheImage(
        const AssetImage('assets/food/cafe-preview.png'),
        key.currentContext!,
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      final boundary =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 1.5);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('../../docs/previews/customer-swiggy-$name.png')
          .writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  void phone(WidgetTester tester, {double width = 390}) {
    tester.view.physicalSize = Size(width, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets(
    'Customer discovery opens menu, preserves quantities and returns from checkout',
    (tester) async {
      phone(tester);
      final boundary = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: igoTheme(),
            home: const Workspace(role: AppRole.customer),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await capture(tester, boundary, 'home');
      await tester.tap(find.text('Explore The Cafe'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add Iced latte'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add Iced latte'));
      await tester.pumpAndSettle();
      expect(find.text('2 items added'), findsOneWidget);
      expect(find.text('MVR 90'), findsOneWidget);
      await capture(tester, boundary, 'menu');
      await tester.tap(find.text('View cart'));
      await tester.pumpAndSettle();
      expect(find.byType(Checkout), findsOneWidget);
      expect(find.text('MVR 90'), findsWidgets);
      await capture(tester, boundary, 'checkout');
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('2 items added'), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Orders'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View order progress'));
      await tester.pumpAndSettle();
      expect(find.text('Your kitchen is on it.'), findsOneWidget);
      await capture(tester, boundary, 'order');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Search stays visible across tabs and clearing restores the catalog',
    (tester) async {
      phone(tester);
      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: igoTheme(),
          home: const Workspace(role: AppRole.customer),
        ),
      );
      await tester.enterText(find.byType(TextField), 'Pizza');
      await tester.pumpAndSettle();
      expect(find.text('Pizza Wave'), findsOneWidget);
      expect(find.text('The Cafe'), findsNothing);
      await tester.tap(find.text('Search'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Pizza',
      );
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('The Cafe'), findsOneWidget);
      expect(find.text('Island Bites'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Connected menu quantities reach the server quote and real payments remain disabled',
    (tester) async {
      phone(tester);
      final calls = <String>[];
      final api = MobileApi(
        baseUrl: 'https://igo.example',
        token: () async => 'test-session',
        client: MockClient((request) async {
          final resource = request.url.path.split('/').last;
          calls.add(resource);
          final restaurant = {
            'id': 'kitchen',
            'name': 'Harbour Kitchen',
            'cuisine': 'Maldivian',
            'area': 'Malé',
            'acceptingOrders': true,
            'prepTime': 20,
          };
          Object result;
          if (resource == 'catalog') {
            result = {
              'restaurant': restaurant,
              'items': [
                {
                  'id': 'bowl',
                  'name': 'Lunch bowl',
                  'description': 'Freshly prepared',
                  'price': 4500,
                },
              ],
              'total': 1,
              'page': 1,
              'categories': ['Mains'],
            };
          } else if (resource == 'account') {
            result = {
              'addresses': [
                {
                  'id': 'entrance',
                  'kind': 'delivery',
                  'area': 'Malé',
                  'building': 'Example home',
                  'latitude': 4.1755,
                  'longitude': 73.5093,
                },
              ],
            };
          } else if (resource == 'quote') {
            final body = jsonDecode(request.body);
            expect(body['restaurantId'], 'kitchen');
            expect(body['addressId'], 'entrance');
            expect(body['items'], [
              {'id': 'bowl', 'quantity': 2},
            ]);
            expect(body.containsKey('amount'), false);
            result = {
              'id': 'quote',
              'amount': 11500,
              'snapshot': {'subtotal': 9000, 'deliveryFee': 2500},
            };
          } else {
            throw StateError('Unexpected request: $resource');
          }
          return http.Response(jsonEncode(result), 200);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: igoTheme(),
          home: LiveMenu(
            api: api,
            restaurant: const {
              'id': 'kitchen',
              'name': 'Harbour Kitchen',
              'cuisine': 'Maldivian',
              'area': 'Malé',
              'acceptingOrders': true,
              'prepTime': 20,
            },
            account: const {},
            refreshAccount: () async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byTooltip('Add Lunch bowl'),
        120,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byTooltip('Add Lunch bowl'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add Lunch bowl'));
      await tester.pumpAndSettle();
      expect(find.text('2 items added'), findsOneWidget);
      await tester.tap(find.text('View cart'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Review total'),
        180,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Review total'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Pay by card & submit order'),
        180,
        scrollable: find.byType(Scrollable).last,
      );
      final pay = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Pay by card & submit order'),
      );
      expect(pay.onPressed, isNull);
      expect(calls.where((call) => call == 'quote').length, 1);
      expect(calls.contains('checkout'), false);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );

  testWidgets(
    'Customer destinations and menu fit 320px with larger text and reduced motion',
    (tester) async {
      phone(tester, width: 320);
      await tester.pumpWidget(
        MaterialApp(
          theme: igoTheme(),
          builder: (_, child) => MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 844),
              textScaler: TextScaler.linear(1.5),
              disableAnimations: true,
              highContrast: true,
            ),
            child: child!,
          ),
          home: const Workspace(role: AppRole.customer),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final tab in ['Search', 'Orders', 'Account', 'Home']) {
        await tester.tap(find.text(tab).last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: tab);
      }
      await tester.scrollUntilVisible(
        find.text('Explore The Cafe'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Explore The Cafe')),
        alignment: .35,
      );
      await tester.pumpAndSettle();
      expect(find.text('Explore The Cafe').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Explore The Cafe'));
      await tester.pumpAndSettle();
      expect(find.byType(MenuPage), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Iced latte'),
        180,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.byType(CustomerMenuItem), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
}
