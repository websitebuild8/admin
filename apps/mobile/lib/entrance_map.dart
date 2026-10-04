import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'models.dart';

import 'dart:math' as math;

const googleMapsKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

/// Assigned job endpoints only: no rider marker, origin or location permission.
class JobMap extends StatelessWidget {
  final GeoPoint pickup, destination;
  const JobMap({super.key, required this.pickup, required this.destination});
  @override
  Widget build(BuildContext context) {
    if (kIsWeb || googleMapsKey.isEmpty) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: SizedBox(
        height: 220,
        child: GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(pickup.latitude, pickup.longitude),
            zoom: 16,
          ),
          myLocationEnabled: false,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          rotateGesturesEnabled: false,
          tiltGesturesEnabled: false,
          markers: {
            Marker(
              markerId: const MarkerId('pickup'),
              position: LatLng(pickup.latitude, pickup.longitude),
              infoWindow: const InfoWindow(title: 'Restaurant pickup'),
              icon: BitmapDescriptor.defaultMarkerWithHue(
                BitmapDescriptor.hueYellow,
              ),
            ),
            Marker(
              markerId: const MarkerId('delivery'),
              position: LatLng(destination.latitude, destination.longitude),
              infoWindow: const InfoWindow(title: 'Customer entrance'),
            ),
          },
          onMapCreated: (controller) {
            if ((pickup.latitude - destination.latitude).abs() < .000001 &&
                (pickup.longitude - destination.longitude).abs() < .000001) {
              return;
            }
            controller.moveCamera(
              CameraUpdate.newLatLngBounds(
                LatLngBounds(
                  southwest: LatLng(
                    math.min(pickup.latitude, destination.latitude) - .0001,
                    math.min(pickup.longitude, destination.longitude) - .0001,
                  ),
                  northeast: LatLng(
                    math.max(pickup.latitude, destination.latitude) + .0001,
                    math.max(pickup.longitude, destination.longitude) + .0001,
                  ),
                ),
                36,
              ),
            );
          },
        ),
      ),
    );
  }
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
