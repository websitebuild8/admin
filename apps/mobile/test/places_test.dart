import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:igo_mobile/main.dart';
import 'package:igo_mobile/models.dart';
import 'package:igo_mobile/places_lookup.dart';

class FakePlaces implements PlacesLookup {
  final Future<List<PlaceSuggestion>> Function(String, String, String)? lookup;
  final GeoPoint location;
  final List<String> sessions = [];
  FakePlaces({this.lookup, this.location = const GeoPoint(4.1755, 73.5093)});
  @override
  Future<List<PlaceSuggestion>> search(
    String input,
    String area,
    String session,
  ) async {
    sessions.add(session);
    return lookup == null
        ? [const PlaceSuggestion('place_1', 'Home, Majeedhee Magu, Malé')]
        : lookup!(input, area, session);
  }

  @override
  Future<ResolvedPlace> resolve(String id, String area, String session) async {
    sessions.add(session);
    return ResolvedPlace(location);
  }
}

Widget page(PlacesLookup places) => MaterialApp(
  home: AddressPage(
    area: 'Malé',
    places: places,
    mapBuilder: (_, _, _, _) => const SizedBox(height: 40),
  ),
);
Future<void> search(WidgetTester tester, String text) async {
  await tester.scrollUntilVisible(
    find.byKey(const ValueKey('address-search')),
    -160,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.enterText(find.byKey(const ValueKey('address-search')), text);
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

void main() {
  test('Places sessions are unique RFC 4122 UUIDs', () {
    final a = newPlacesSession(), b = newPlacesSession();
    expect(
      a,
      matches(
        RegExp(
          r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
        ),
      ),
    );
    expect(a, isNot(b));
  });
  testWidgets(
    'Choosing a suggestion fills location automatically; typing alone does not',
    (tester) async {
      final places = FakePlaces();
      await tester.pumpWidget(page(places));
      await search(tester, 'Home');
      await tester.ensureVisible(
        find.byKey(const ValueKey('entrance-confirmation')),
      );
      expect(
        find.text('An entrance pin has not been confirmed.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Home, Majeedhee Magu, Malé'));
      await tester.tap(find.text('Home, Majeedhee Magu, Malé'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('entrance-confirmation')),
      );
      expect(
        find.text('Entrance confirmed · 4.175500, 73.509300'),
        findsOneWidget,
      );
      expect(places.sessions[0], places.sessions[1]);
      await tester.ensureVisible(
        find.byKey(const ValueKey('address-building')),
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('address-building')),
            )
            .controller!
            .text,
        'Home',
      );
      await search(tester, 'Another home');
      await tester.ensureVisible(
        find.byKey(const ValueKey('entrance-confirmation')),
      );
      expect(
        find.text('An entrance pin has not been confirmed.'),
        findsOneWidget,
      );
      expect(places.sessions.last, isNot(places.sessions.first));
    },
  );
  testWidgets('Late search responses cannot replace a newer result', (
    tester,
  ) async {
    final old = Completer<List<PlaceSuggestion>>();
    final places = FakePlaces(
      lookup: (input, _, _) => input == 'First'
          ? old.future
          : Future.value([const PlaceSuggestion('new', 'Newest building')]),
    );
    await tester.pumpWidget(page(places));
    await search(tester, 'First');
    await search(tester, 'Second');
    old.complete([const PlaceSuggestion('old', 'Wrong old building')]);
    await tester.pumpAndSettle();
    expect(find.text('Newest building'), findsOneWidget);
    expect(find.text('Wrong old building'), findsNothing);
  });
  testWidgets('Out-of-island locations are not accepted', (tester) async {
    await tester.pumpWidget(
      page(FakePlaces(location: const GeoPoint(4.216, 73.541))),
    );
    await search(tester, 'Home');
    await tester.tap(find.text('Home, Majeedhee Magu, Malé'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Choose a building in Malé.'), findsOneWidget);
    await tester.ensureVisible(
      find.byKey(const ValueKey('entrance-confirmation')),
    );
    expect(
      find.text('An entrance pin has not been confirmed.'),
      findsOneWidget,
    );
  });
  testWidgets('Switching islands discards pending results', (tester) async {
    final pending = Completer<List<PlaceSuggestion>>();
    await tester.pumpWidget(
      page(FakePlaces(lookup: (_, _, _) => pending.future)),
    );
    await search(tester, 'Home');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('address-area')),
      -160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('address-area')));
    // The unresolved search intentionally keeps its progress animation active.
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text('Hulhumalé').last);
    await tester.pumpAndSettle();
    pending.complete([const PlaceSuggestion('old', 'Old island building')]);
    await tester.pumpAndSettle();
    expect(find.text('Old island building'), findsNothing);
  });
}
