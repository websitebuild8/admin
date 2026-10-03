import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models.dart';

/// Maps only an entrance. Never enables the platform location engine.
class EntranceMap extends StatefulWidget {
  final String area;
  final GeoPoint? initialPoint;
  final ValueChanged<GeoPoint> onSelected;
  final ValueChanged<GeoPoint> onMoved;
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
  // Public tiles need no key. Swap the provider without changing address data.
  static const styleUrl = String.fromEnvironment(
    'IGO_MAP_STYLE_URL',
    defaultValue: 'https://tiles.openfreemap.org/styles/liberty',
  );
  MapLibreMapController? controller;
  late GeoPoint center =
      widget.initialPoint ?? ServiceArea.named(widget.area).center;
  bool ready = false, slow = false;
  late final Timer loadingTimer;

  @override
  void initState() {
    super.initState();
    loadingTimer = Timer(const Duration(seconds: 20), () {
      if (mounted && !ready) setState(() => slow = true);
    });
  }

  @override
  void dispose() {
    loadingTimer.cancel();
    // MapLibreMap owns and disposes its controller.
    super.dispose();
  }

  void updateCenter() {
    final target = controller?.cameraPosition?.target;
    if (target != null && mounted) {
      setState(() => center = GeoPoint(target.latitude, target.longitude));
      widget.onMoved(center);
    }
  }

  Future<void> attribution(String url) async {
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      // Attribution remains visible even when an external browser is unavailable.
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: 255,
          child: Semantics(
            label:
                'Entrance map for ${widget.area}. Move the map to your entrance.',
            child: Stack(
              children: [
                MapLibreMap(
                  styleString: styleUrl,
                  initialCameraPosition: CameraPosition(
                    target: LatLng(center.latitude, center.longitude),
                    zoom: 16,
                  ),
                  cameraTargetBounds: CameraTargetBounds(
                    LatLngBounds(
                      southwest: const LatLng(4.158, 73.49),
                      northeast: const LatLng(4.253, 73.565),
                    ),
                  ),
                  minMaxZoomPreference: const MinMaxZoomPreference(13, 20),
                  myLocationEnabled: false,
                  myLocationTrackingMode: MyLocationTrackingMode.none,
                  trackCameraPosition: true,
                  rotateGesturesEnabled: false,
                  tiltGesturesEnabled: false,
                  compassEnabled: false,
                  gestureRecognizers: {
                    Factory<OneSequenceGestureRecognizer>(
                      () => EagerGestureRecognizer(),
                    ),
                  },
                  onMapCreated: (value) => controller = value,
                  onStyleLoadedCallback: () {
                    if (mounted) setState(() => ready = true);
                    loadingTimer.cancel();
                  },
                  onCameraIdle: updateCenter,
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
                      // Place the pin tip, rather than its center, at the target.
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
                if (!ready)
                  Positioned(
                    left: 12,
                    right: 12,
                    top: 12,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: .94),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            slow
                                ? 'Map taking too long? Enter coordinates below.'
                                : 'Loading your neighbourhood…',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      // Visible provider/data credits accompany the SDK attribution control.
      Wrap(
        alignment: WrapAlignment.center,
        children: [
          TextButton(
            onPressed: () => attribution('https://openfreemap.org/'),
            child: const Text('OpenFreeMap', style: TextStyle(fontSize: 11)),
          ),
          TextButton(
            onPressed: () => attribution('https://www.openmaptiles.org/'),
            child: const Text('OpenMapTiles', style: TextStyle(fontSize: 11)),
          ),
          TextButton(
            onPressed: () =>
                attribution('https://www.openstreetmap.org/copyright'),
            child: const Text(
              '© OpenStreetMap',
              style: TextStyle(fontSize: 11),
            ),
          ),
        ],
      ),
      OutlinedButton.icon(
        onPressed: ready
            ? () {
                updateCenter();
                widget.onSelected(center);
              }
            : null,
        icon: const Icon(Icons.place_outlined),
        label: const Text('Confirm entrance pin'),
      ),
    ],
  );
}
