# ABA Shop — Flutter Mobile App

Mobile client for the `e-commerce-backend-phase-one` Next.js API. State
management is Riverpod (`flutter_riverpod`, plain `StateNotifier`/
`AsyncNotifier` — no code generation, so it drops in without `build_runner`).

## What's included

```
lib/
  core/
    app_config.dart       # API base URL, ABA scheme, polling interval — edit here
    api_client.dart        # Dio wrapper for every backend endpoint used
    api_exception.dart
  models/
    product.dart  cart_item.dart  order.dart  checkout_response.dart
  providers/
    core_providers.dart      # ApiClient singleton
    product_providers.dart   # product list (pull-to-refresh) + detail fetch
    cart_provider.dart       # cart state, item count, subtotal
    checkout_provider.dart   # POST /api/orders/checkout submission state
    order_status_provider.dart  # 3s polling of GET /api/orders/{id}
  screens/
    home_screen.dart            # 1. Store screen
    product_detail_screen.dart  # 1. Product detail
    checkout_screen.dart        # 2. Delivery form -> checkout call
    payment_screen.dart         # 3. KHQR + deep link + polling
    order_success_screen.dart
  widgets/
    product_card.dart  cart_badge.dart  quantity_selector.dart
  main.dart
```

## Bootstrapping the platform folders

This zip ships only `lib/`, `pubspec.yaml`, and `analysis_options.yaml` —
the Dart/Flutter side. Generate the Android/iOS scaffolding once with the
Flutter SDK, then drop this `lib/` and `pubspec.yaml` in over it:

```bash
flutter create --org com.yourcompany --project-name aba_shop_app tmp_scaffold
cp -r tmp_scaffold/android tmp_scaffold/ios .
rm -rf tmp_scaffold
flutter pub get
```

### Android manifest additions (`android/app/src/main/AndroidManifest.xml`)

```xml
<manifest ...>
  <uses-permission android:name="android.permission.INTERNET"/>

  <!-- Required on Android 11+ so url_launcher / canLaunchUrl can see
       the ABA Mobile app and the browser for the deep-link fallback. -->
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW"/>
      <data android:scheme="abamobile"/>
    </intent>
    <intent>
      <action android:name="android.intent.action.VIEW"/>
      <data android:scheme="https"/>
    </intent>
  </queries>

  <application ...>
    ...
  </application>
</manifest>
```

### iOS Info.plist additions (`ios/Runner/Info.plist`)

```xml
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>abamobile</string>
</array>
```

## Configuration

Point the app at your backend and (once confirmed) the correct ABA
Mobile deep-link scheme without touching code, via `--dart-define`:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=ABA_APP_SCHEME=abamobile://payway
```

- Android emulator → backend on your machine: use `10.0.2.2`.
- Physical device: use your machine's LAN IP, e.g. `http://192.168.1.20:3000`.
- Defaults live in `lib/core/app_config.dart` if you'd rather hardcode them.

## Two integration points you'll need to confirm with the backend/ABA

1. **Order status endpoint for guests.** `PHASE2_INTEGRATION_GUIDE.md`
   marks `GET /api/orders/{id}` as requiring authentication, but this
   app's checkout flow is guest (no login screen was in scope). Either:
   - add a public, narrowly-scoped status route such as
     `GET /api/orders/{id}/status` returning just
     `{ "status": "...", "paymentStatus": "..." }`, or
   - return a short-lived order-access token from the checkout response
     and accept it as a query param / header on the existing route.

   `ApiClient.getOrder()` in `lib/core/api_client.dart` is the single
   place to update once you land on one of these.

2. **ABA Mobile deep-link scheme.** `abamobile://payway` in
   `app_config.dart` is a placeholder — ABA doesn't publish one fixed
   public scheme for merchant deep-linking. Confirm the exact scheme
   (or Universal Link) with your ABA PayWay integration contact, then
   set it via `ABA_APP_SCHEME` or update the constant. The button
   already falls back to opening `checkoutUrl` in the browser if the
   custom scheme fails to launch or the app isn't installed.

## Notes on behavior

- **Pull-to-refresh**: `ProductListNotifier.refresh()` is called
  directly from the `RefreshIndicator`, so it's awaited properly rather
  than racing a `ref.invalidate` rebuild.
- **Cart badge**: reactive via `cartItemCountProvider`; tapping it opens
  Checkout directly (there's no separate cart screen in scope — add one
  if you want line-item editing before checkout).
- **Polling**: `OrderStatusNotifier` polls every 3s, stops as soon as
  `paymentStatus` is `paid`/`failed`, and gives up after 5 minutes with
  a manual "Check payment status again" button so the app never polls
  forever in the background.
- **Save / Share QR**: downloads the KHQR image to a temp file and uses
  `share_plus` so the user can save to Photos or share directly in a
  chat app; falls back to sharing the raw URL if the download fails.
