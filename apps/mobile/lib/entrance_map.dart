import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'models.dart';

import 'dart:math' as math;

const googleMapsKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

LatLng _latLng(GeoPoint point) => LatLng(point.latitude, point.longitude);

LatLngBounds _areaBounds(ServiceArea area) => LatLngBounds(
  southwest: _latLng(area.southWest),
  northeast: _latLng(area.northEast),
);

// Camera browsing includes the bridge between the islands. This does not extend
// the backend's delivery coverage beyond its independently validated areas.
final deliveryMapBounds = LatLngBounds(
  southwest: _latLng(ServiceArea.values.first.southWest),
  northeast: _latLng(ServiceArea.values.last.northEast),
);

/// Fits both islands for a cross-island job, or just the selected service area
/// when waiting for a job. Invalid/out-of-area endpoints are never plotted.
class JobMapViewport {
  final GeoPoint? pickup, destination;
  final CameraPosition camera;
  final LatLngBounds? fitBounds;
  const JobMapViewport._(
    this.pickup,
    this.destination,
    this.camera,
    this.fitBounds,
  );

  factory JobMapViewport.forJob({
    GeoPoint? pickup,
    GeoPoint? destination,
    String area = 'Malé',
  }) {
    GeoPoint? valid(GeoPoint? point) =>
        point != null && ServiceArea.values.any((a) => a.contains(point))
        ? point
        : null;
    final start = valid(pickup), end = valid(destination);
    final island = ServiceArea.named(area);
    final center = start ?? end ?? island.center;
    LatLngBounds? bounds;
    if (start == null && end == null) {
      bounds = _areaBounds(island);
    } else if (start != null &&
        end != null &&
        (start.latitude - end.latitude).abs() +
                (start.longitude - end.longitude).abs() >
            .000001) {
      bounds = LatLngBounds(
        southwest: LatLng(
          math.min(start.latitude, end.latitude) - .0001,
          math.min(start.longitude, end.longitude) - .0001,
        ),
        northeast: LatLng(
          math.max(start.latitude, end.latitude) + .0001,
          math.max(start.longitude, end.longitude) + .0001,
        ),
      );
    }
    return JobMapViewport._(
      start,
      end,
      CameraPosition(target: _latLng(center), zoom: bounds == null ? 17 : 14),
      bounds,
    );
  }
}

/// Area overview or saved endpoints. No rider position, simulated movement or
/// in-app route geometry; Google Maps supplies navigation outside iGO.
class JobMap extends StatefulWidget {
  final GeoPoint? pickup, destination;
  final String area;
  final double height, radius, bottomInset, topInset;
  final bool illustrated;
  const JobMap({
    super.key,
    this.pickup,
    this.destination,
    this.area = 'Malé',
    this.height = 220,
    this.radius = 22,
    this.bottomInset = 0,
    this.topInset = 0,
    this.illustrated = false,
  });
  @override
  State<JobMap> createState() => _JobMapState();
}

class _JobMapState extends State<JobMap> {
  GoogleMapController? controller;
  int fitRevision = 0;

  JobMapViewport get viewport => JobMapViewport.forJob(
    pickup: widget.pickup,
    destination: widget.destination,
    area: widget.area,
  );

  @override
  void didUpdateWidget(JobMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pickup?.label != widget.pickup?.label ||
        oldWidget.destination?.label != widget.destination?.label ||
        oldWidget.area != widget.area ||
        oldWidget.bottomInset != widget.bottomInset ||
        oldWidget.topInset != widget.topInset ||
        oldWidget.height != widget.height) {
      scheduleFit();
    }
  }

  void scheduleFit() {
    final revision = ++fitRevision;
    // Bounds fitting requires a laid-out native view. Read the newest endpoints
    // so a replaced/expired order cannot leave stale markers.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && revision == fitRevision) fit();
    });
  }

  Future<void> fit({bool animate = false}) async {
    final active = controller;
    if (active == null) return;
    final view = viewport;
    final update = view.fitBounds == null
        ? CameraUpdate.newCameraPosition(view.camera)
        : CameraUpdate.newLatLngBounds(view.fitBounds!, 36);
    try {
      if (animate && !MediaQuery.disableAnimationsOf(context)) {
        await active.animateCamera(update);
      } else {
        await active.moveCamera(update);
      }
    } on PlatformException {
      // A native view can be removed during a camera call. The visible fit
      // button also allows retrying if its first layout was not ready yet.
    }
  }

  @override
  Widget build(BuildContext context) {
    final view = viewport;
    Widget map;
    if (kIsWeb || googleMapsKey.isEmpty) {
      map = widget.illustrated
          ? _IllustratedMap(
              docked: widget.bottomInset > 0,
              bottomInset: widget.bottomInset,
            )
          : Container(
              color: const Color(0xFFEFF2EA),
              alignment: Alignment.center,
              padding: EdgeInsets.fromLTRB(
                20,
                widget.topInset + 16,
                20,
                widget.bottomInset + 16,
              ),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.map_outlined, size: 32),
                  SizedBox(height: 12),
                  Text(
                    'Map unavailable',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Your order details and updates are still available.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12),
                  ),
                ],
              ),
            );
    } else {
      map = Stack(
        fit: StackFit.expand,
        children: [
          Semantics(
            label: view.pickup == null && view.destination == null
                ? 'Google map of ${widget.area} service area'
                : 'Google map showing saved pickup and delivery entrances',
            child: GoogleMap(
              initialCameraPosition: view.camera,
              cameraTargetBounds: CameraTargetBounds(deliveryMapBounds),
              minMaxZoomPreference: const MinMaxZoomPreference(10, 20),
              padding: EdgeInsets.fromLTRB(
                8,
                widget.topInset,
                8,
                widget.bottomInset,
              ),
              myLocationEnabled: false,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              zoomControlsEnabled: false,
              rotateGesturesEnabled: false,
              tiltGesturesEnabled: false,
              markers: {
                if (view.pickup != null)
                  Marker(
                    markerId: const MarkerId('pickup'),
                    position: _latLng(view.pickup!),
                    infoWindow: const InfoWindow(title: 'Restaurant pickup'),
                    icon: BitmapDescriptor.defaultMarkerWithHue(
                      BitmapDescriptor.hueYellow,
                    ),
                  ),
                if (view.destination != null)
                  Marker(
                    markerId: const MarkerId('delivery'),
                    position: _latLng(view.destination!),
                    infoWindow: const InfoWindow(title: 'Delivery entrance'),
                  ),
              },
              onMapCreated: (value) {
                if (!mounted) return;
                setState(() => controller = value);
                scheduleFit();
              },
            ),
          ),
          Positioned(
            right: 14,
            bottom: widget.bottomInset + 16,
            child: IconButton.filledTonal(
              tooltip: view.pickup == null && view.destination == null
                  ? 'Show ${widget.area}'
                  : 'Show saved entrances',
              onPressed: controller == null ? null : () => fit(animate: true),
              style: IconButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: .9),
                foregroundColor: const Color(0xFF181918),
              ),
              icon: const Icon(Icons.center_focus_strong),
            ),
          ),
        ],
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: SizedBox(height: widget.height, child: map),
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
          color: const Color(0xFFF3F4EF),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 32),
            const SizedBox(height: 12),
            Text(
              widget.initialPoint == null
                  ? 'Map unavailable. Search for your building above or use entrance coordinates below.'
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
