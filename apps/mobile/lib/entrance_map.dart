import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'models.dart';

import 'dart:math' as math;

const googleMapsKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

/// Area overview or saved endpoints. No rider position, simulated movement or
/// in-app route geometry; Google Maps supplies navigation outside iGO.
class JobMap extends StatelessWidget {
  final GeoPoint? pickup, destination;
  final String area;
  final double height, radius, bottomInset;
  final bool illustrated;
  const JobMap({
    super.key,
    this.pickup,
    this.destination,
    this.area = 'Malé',
    this.height = 220,
    this.radius = 22,
    this.bottomInset = 0,
    this.illustrated = false,
  });
  @override
  Widget build(BuildContext context) {
    final center = pickup ?? destination ?? ServiceArea.named(area).center;
    Widget map;
    if (kIsWeb || googleMapsKey.isEmpty) {
      map = illustrated
          ? _IllustratedMap(docked: bottomInset > 0, bottomInset: bottomInset)
          : Container(
              color: const Color(0xFFEFF2EA),
              alignment: Alignment.topCenter,
              padding: EdgeInsets.fromLTRB(24, 92, 24, bottomInset + 16),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.map_outlined, size: 38),
                  SizedBox(height: 12),
                  Text(
                    'Map preview unavailable',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'The configured Android or iOS app shows your saved entrances here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12),
                  ),
                ],
              ),
            );
    } else {
      map = GoogleMap(
        key: ValueKey('${pickup?.label}/${destination?.label}/$area'),
        initialCameraPosition: CameraPosition(
          target: LatLng(center.latitude, center.longitude),
          zoom: pickup == null && destination == null ? 14 : 16,
        ),
        padding: EdgeInsets.only(bottom: bottomInset, left: 8, right: 8),
        myLocationEnabled: false,
        myLocationButtonEnabled: false,
        mapToolbarEnabled: false,
        zoomControlsEnabled: false,
        rotateGesturesEnabled: false,
        tiltGesturesEnabled: false,
        markers: {
          if (pickup != null)
            Marker(
              markerId: const MarkerId('pickup'),
              position: LatLng(pickup!.latitude, pickup!.longitude),
              infoWindow: const InfoWindow(title: 'Restaurant pickup'),
              icon: BitmapDescriptor.defaultMarkerWithHue(
                BitmapDescriptor.hueYellow,
              ),
            ),
          if (destination != null)
            Marker(
              markerId: const MarkerId('delivery'),
              position: LatLng(destination!.latitude, destination!.longitude),
              infoWindow: const InfoWindow(title: 'Delivery entrance'),
            ),
        },
        onMapCreated: (controller) {
          if (pickup == null ||
              destination == null ||
              (pickup!.latitude - destination!.latitude).abs() +
                      (pickup!.longitude - destination!.longitude).abs() <
                  .000001) {
            return;
          }
          controller
              .moveCamera(
                CameraUpdate.newLatLngBounds(
                  LatLngBounds(
                    southwest: LatLng(
                      math.min(pickup!.latitude, destination!.latitude) - .0001,
                      math.min(pickup!.longitude, destination!.longitude) -
                          .0001,
                    ),
                    northeast: LatLng(
                      math.max(pickup!.latitude, destination!.latitude) + .0001,
                      math.max(pickup!.longitude, destination!.longitude) +
                          .0001,
                    ),
                  ),
                  40,
                ),
              )
              .catchError((_) {});
        },
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(height: height, child: map),
    );
  }
}

/// Original abstract street illustration for fictional preview screens only.
/// Deliberately not georeferenced and not displayed as provider map data.
class _IllustratedMap extends StatelessWidget {
  final bool docked;
  final double bottomInset;
  const _IllustratedMap({required this.docked, required this.bottomInset});
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, constraints) => Stack(
      children: [
        const Positioned.fill(
          child: CustomPaint(painter: _StreetIllustration()),
        ),
        Positioned(
          left: 20,
          top: math.max(160, constraints.maxHeight - bottomInset) * .28,
          child: const _MapLabel(Icons.storefront, 'Sample pickup'),
        ),
        Positioned(
          right: 22,
          top: math.max(160, constraints.maxHeight - bottomInset) * .55,
          child: const _MapLabel(Icons.home_outlined, 'Sample entrance'),
        ),
        Positioned(
          left: 18,
          top: docked ? 98 : null,
          bottom: docked ? null : 12,
          child: const Text(
            'Illustrated preview · not a navigation map',
            style: TextStyle(fontSize: 9, color: Color(0xFF72756F)),
          ),
        ),
      ],
    ),
  );
}

class _MapLabel extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MapLabel(this.icon, this.text);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(22),
      boxShadow: const [
        BoxShadow(
          color: Color(0x14181918),
          blurRadius: 12,
          offset: Offset(0, 4),
        ),
      ],
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 19),
        const SizedBox(width: 7),
        Text(
          text,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _StreetIllustration extends CustomPainter {
  const _StreetIllustration();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFFDEF0F2),
    );
    final land = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width * .84, 0)
      ..quadraticBezierTo(
        size.width * 1.05,
        size.height * .27,
        size.width * .9,
        size.height * .46,
      )
      ..quadraticBezierTo(
        size.width * .82,
        size.height * .72,
        size.width,
        size.height,
      )
      ..lineTo(0, size.height)
      ..close();
    canvas.save();
    canvas.clipPath(land);
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFFEDEFEA),
    );
    for (int x = -3; x < 14; x++) {
      canvas.drawLine(
        Offset(x * 42.0, -40),
        Offset(x * 42.0 - 100, size.height + 40),
        Paint()
          ..color = Colors.white
          ..strokeWidth = 7,
      );
    }
    for (int y = 0; y < 22; y++) {
      canvas.drawLine(
        Offset(-30, y * 46.0),
        Offset(size.width + 30, y * 46.0 - 46),
        Paint()
          ..color = Colors.white
          ..strokeWidth = 7,
      );
    }
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * .58, 112, 57, 72),
        const Radius.circular(12),
      ),
      Paint()..color = const Color(0xFFCCDDBB),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(20, 300, 78, 84),
        const Radius.circular(14),
      ),
      Paint()..color = const Color(0xFFCCDDBB),
    );
    canvas.drawLine(
      Offset(-30, size.height * .57),
      Offset(size.width, size.height * .28),
      Paint()
        ..color = const Color(0xFFE3DFCA)
        ..strokeWidth = 14,
    );
    canvas.drawLine(
      Offset(-30, size.height * .57),
      Offset(size.width, size.height * .28),
      Paint()
        ..color = Colors.white
        ..strokeWidth = 8,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Displays a saved/search-selected entrance. Device GPS is never enabled.
class EntranceMap extends StatefulWidget {
  final String area;
  final GeoPoint? initialPoint;
  final ValueChanged<GeoPoint> onSelected, onMoved;
  const EntranceMap({
    super.key,
    required this.area,
    required this.onSelected,
    required this.onMoved,
    this.initialPoint,
  });
  @override
  State<EntranceMap> createState() => _EntranceMapState();
}

class _EntranceMapState extends State<EntranceMap> {
  late GeoPoint center =
      widget.initialPoint ?? ServiceArea.named(widget.area).center;
  bool ready = false;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb || googleMapsKey.isEmpty) {
      return Container(
        height: 170,
        alignment: Alignment.center,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7C9),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 32),
            const SizedBox(height: 12),
            Text(
              widget.initialPoint == null
                  ? 'Search for your building above. The interactive map will be available in the configured mobile app.'
                  : 'Location selected · ${widget.initialPoint!.label}\nReview your building and entrance details below.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }
    final area = ServiceArea.named(widget.area);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: SizedBox(
            height: 255,
            child: Semantics(
              label:
                  'Google map for ${widget.area}. Adjust the entrance only if necessary.',
              child: Stack(
                children: [
                  GoogleMap(
                    initialCameraPosition: CameraPosition(
                      target: LatLng(center.latitude, center.longitude),
                      zoom: 17,
                    ),
                    cameraTargetBounds: CameraTargetBounds(
                      LatLngBounds(
                        southwest: LatLng(
                          area.southWest.latitude,
                          area.southWest.longitude,
                        ),
                        northeast: LatLng(
                          area.northEast.latitude,
                          area.northEast.longitude,
                        ),
                      ),
                    ),
                    minMaxZoomPreference: const MinMaxZoomPreference(13, 20),
                    myLocationEnabled: false,
                    myLocationButtonEnabled: false,
                    zoomControlsEnabled: false,
                    mapToolbarEnabled: false,
                    rotateGesturesEnabled: false,
                    tiltGesturesEnabled: false,
                    gestureRecognizers: {
                      Factory<OneSequenceGestureRecognizer>(
                        () => EagerGestureRecognizer(),
                      ),
                    },
                    onMapCreated: (_) {
                      if (mounted) setState(() => ready = true);
                    },
                    onCameraMove: (camera) {
                      center = GeoPoint(
                        camera.target.latitude,
                        camera.target.longitude,
                      );
                      widget.onMoved(center);
                    },
                  ),
                  const Center(
                    child: IgnorePointer(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: 40),
                        child: Icon(
                          Icons.location_on,
                          size: 48,
                          color: Color(0xFF181918),
                          shadows: [
                            Shadow(color: Color(0xFFFFDF35), blurRadius: 8),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: ready ? () => widget.onSelected(center) : null,
          icon: const Icon(Icons.place_outlined),
          label: const Text('Confirm adjusted entrance'),
        ),
      ],
    );
  }
}
