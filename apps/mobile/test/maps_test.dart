import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:igo_mobile/delivery_widgets.dart';
import 'package:igo_mobile/entrance_map.dart';
import 'package:igo_mobile/models.dart';

void main() {
  test('Area overview fits the selected island without creating job pins', () {
    for (final area in ServiceArea.values) {
      final view = JobMapViewport.forJob(area: area.name);
      expect(view.pickup, isNull);
      expect(view.destination, isNull);
      expect(view.camera.target.latitude, area.center.latitude);
      expect(view.fitBounds!.southwest.latitude, area.southWest.latitude);
      expect(view.fitBounds!.northeast.longitude, area.northEast.longitude);
    }
  });

  test('Cross-island jobs fit both entrances in either pickup direction', () {
    final male = ServiceArea.named('Malé').center;
    final hulhumale = ServiceArea.named('Hulhumalé').center;
    for (final pair in [
      [male, hulhumale],
      [hulhumale, male],
    ]) {
      final view = JobMapViewport.forJob(pickup: pair[0], destination: pair[1]);
      for (final point in pair) {
        final position = LatLng(point.latitude, point.longitude);
        expect(view.fitBounds!.contains(position), isTrue);
        expect(deliveryMapBounds.contains(position), isTrue);
      }
    }
  });

  test(
    'Single or identical entrances use a close camera without empty bounds',
    () {
      final point = ServiceArea.named('Malé').center;
      for (final view in [
        JobMapViewport.forJob(destination: point),
        JobMapViewport.forJob(pickup: point, destination: point),
      ]) {
        expect(view.camera.target, LatLng(point.latitude, point.longitude));
        expect(view.camera.zoom, 17);
        expect(view.fitBounds, isNull);
      }
    },
  );

  test(
    'Entrances along one latitude still produce non-zero fitting bounds',
    () {
      final view = JobMapViewport.forJob(
        pickup: const GeoPoint(4.1755, 73.5093),
        destination: const GeoPoint(4.1755, 73.515),
      );
      expect(
        view.fitBounds!.southwest.latitude,
        lessThan(view.fitBounds!.northeast.latitude),
      );
      expect(view.fitBounds!.contains(const LatLng(4.1755, 73.515)), isTrue);
    },
  );

  test(
    'Invalid and out-of-coverage endpoints cannot create misleading pins',
    () {
      for (final point in [
        const GeoPoint(double.nan, 73.51),
        const GeoPoint(100, 73.51),
        const GeoPoint(51.5, -.1),
      ]) {
        final view = JobMapViewport.forJob(
          pickup: point,
          destination: point,
          area: 'Hulhumalé',
        );
        expect(view.pickup, isNull);
        expect(view.destination, isNull);
        expect(view.camera.target.latitude, 4.2160);
      }
    },
  );

  testWidgets('Rider map reserves its work panel and attribution space', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RiderMapWorkspace(
            area: 'Malé',
            online: false,
            panel: Text('Choose a request to start a delivery.'),
          ),
        ),
      ),
    );
    final map = tester.widget<JobMap>(find.byType(JobMap));
    expect(map.topInset, 100);
    expect(map.bottomInset, greaterThan(106));
    expect(640 - map.bottomInset - map.topInset, greaterThanOrEqualTo(160));
    expect(find.text('You’re offline'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
