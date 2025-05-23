# Google Ads Conversion Improver Tag for Google Tag Manager Server Container

- Checks if a conversion has already been attributed in Google Ads using **Google Ads Conversion Adjustments API**.
- If not attributed, it resends the conversion using the **Google Ads Offline Conversion API**.
- Helps improve attribution for delayed or missed conversions.
- Avoids duplicate reporting by validating existing conversions before resending.
- Supports enhanced conversions and cart data.

## Important Usage Notes

To ensure proper attribution validation, the tag must be triggered with a **delayed request**, ideally **8 to 23.5 hours after the original conversion event (it can be earlier)**.

The reason is that the **Google Ads Conversions Improver Tag** checks in Google Ads if a conversion has been recorded or not. For this check to work properly, the tag must execute later than the actual conversion time, allowing Google Ads enough time to process the original conversion. When the tag queries Google Ads, it can then correctly detect whether the conversion was attributed or not and resend it if needed.

There are several ways to implement this delay:

- [Stape Request Delay](https://stape.io/solutions/request-delay)
- [Firestore Request Delay](https://stape.io/solutions/firestore-request-delay-tag)
- A custom solution that send a request to the server container with the same conversion data at a later time, allowing the container to trigger de tag

Without a delay, the tag will run before Google Ads has finished processing the original conversion, leading to inaccurate results.

The **Order ID** is a required parameter. This is the key used to check whether the conversion was attributed in Google Ads. If you do not have a unique order ID, generate a pseudo-ID and pass it to the tag. Ensure you send this same pseudo-ID again in the delayed request so it can be used to query Google Ads for the attributed conversion.

## Parameters

- **Source Conversion Action ID** – ID of the conversion action to check attribution for.
- **Destination Conversion Action ID** – ID of the conversion action to which the conversion should be attributed if it hasn't already been recorded.
- **Operating Customer ID** – The Google Ads account ID where the conversions reside.
- **Customer ID** – The Google Ads MCC account ID used for authorization.
If you use Stape, **you can enable the Google connection in the container settings**. If you don’t use Stape, add your **Google Ads Developer Token**.
- **Conversion Value** – Value of the conversion. If not set, will be extracted from `conversionValue`, `value`, or `x-ga-mp1-ev` in Event Data.
- **Currency Code** – Currency of the conversion. If not set, will be extracted from Event Data.
- **Order ID** - Unique order identifier.

  This is the key used to query Google Ads to determine whether the conversion has already been attributed. If you don’t have a true order ID, you must generate a **pseudo-ID** and pass it to the tag.
  This same ID must also be sent in your **delayed request**, so the lookup and validation work correctly.
- **Conversion DateTime** – Timestamp of the conversion. Must follow the formats: `Unix timestamp` (seconds or milliseconds) or `yyyy-mm-dd hh:mm:ss+|-hh:mm`. If not set, the current time is used.
- **Gclid / Gbraid / Wbraid** – Google Click IDs used for attribution.
- **User Identifiers** – Email or phone hashed with SHA256. Used for Enhanced Conversions.
- **Merchant Center Feed Info** – Includes merchant ID, feed country/language codes, and cart-level discounts.
- **Items** – Data about purchased products. Can include product ID, quantity, and unit price.

### Required Parameters

- **Order ID**
- **Currency** and **Conversion Value** (preferred); or **User Identifiers**

## Troubleshooting

### Error: `CONVERSION_ACTION_NOT_ELIGIBLE_FOR_ENHANCEMENT`

If you encounter this error, try one of the following:

1. **Add a currency and a value to the tag**. This won’t affect anything in Google Ads, but will cause the tag to query Google Ads with a `RESTATEMENT` type instead of `ENHANCEMENT`, avoiding the error. The tag instructs Google Ads NOT to do anything with the data received via the **Google Ads Conversion Adjustments API**, it only cares about the response if the conversion has been attributed or not.
2. **Switch the Enhanced Conversions source to API** in your Google Ads Conversion Settings.
    > ⚠️ **Warning**: This may disrupt with Enhanced Conversions sent via gtag.js or web GTM. Not recommended!
      [Learn more](https://support.google.com/google-ads/answer/13261987#setup_enhanced_conversions)

## Open Source

The **Google Ads Conversion Improver Tag for GTM Server Side** is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.