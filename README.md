# Google Ads Conversion Improver Tag for Google Tag Manager Server Container

- Checks if a conversion has already been attributed in Google Ads using Google Ads Conversion Adjustments API.
- If not attributed, it resends the conversion using the Google Ads Offline Conversion API.
- Helps improve attribution for delayed or missed conversions.
- Avoids duplicate reporting by validating existing conversions before resending.
- Supports enhanced conversions and cart data.

## Parameters

- **Source Conversion Action ID** – ID of the conversion action to check attribution for.
- **Destination Conversion Action ID** – ID of the conversion action to which the conversion should be attributed if it hasn't already been recorded.
- **Operating Customer ID** – The Google Ads account ID where the conversions reside.
- **Customer ID** – The Google Ads MCC account ID used for authorization.
If you use Stape, **you can enable the Google connection in the container settings**. If you don’t use Stape, add your **Google Ads Developer Token**.
- **Conversion Value** – Value of the conversion. If not set, will be extracted from `conversionValue`, `value`, or `x-ga-mp1-ev` in Event Data.
- **Currency Code** – Currency of the conversion. If not set, will be extracted from Event Data.
- **Order ID** – Unique order identifier. Used for deduplication.
- **Conversion DateTime** – Timestamp of the conversion. Must follow the format `yyyy-mm-dd hh:mm:ss+|-hh:mm`. If not set, the current time is used.
- **Gclid / Gbraid / Wbraid** – Google Click IDs used for attribution.
- **User Identifiers** – Email or phone hashed with SHA256. Used for Enhanced Conversions.
- **Merchant Center Feed Info** – Includes merchant ID, feed country/language codes, and cart-level discounts.
- **Items** – Data about purchased products. Can include product ID, quantity, and unit price.

## Open Source

The **Google Ads Conversion Improver Tag for GTM Server Side** is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.