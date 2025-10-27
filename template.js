const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const getRequestHeader = require('getRequestHeader');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const makeString = require('makeString');
const makeNumber = require('makeNumber');
const makeInteger = require('makeInteger');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const sha256Sync = require('sha256Sync');
const Math = require('Math');
const Object = require('Object');
const getGoogleAuth = require('getGoogleAuth');
const BigQuery = require('BigQuery');
const Promise = require('Promise');

/**********************************************************************************************/

const traceId = getRequestHeader('trace-id');
const apiVersion = '22';
const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

sendConversionRequestForConversionAdjustment()
  .then((body) => {
    if (!body) return;
    const bodyJson = JSON.parse(body);
    if (getType(bodyJson) !== 'object') return;
    if (!bodyJson.partialFailureError) return;

    const message =
      bodyJson.partialFailureError.details[0].errors[0].errorCode
        .conversionAdjustmentUploadError;
    if (message === 'CONVERSION_NOT_FOUND') {
      return sendConversionRequestForOfflineConversion();
    }
  })
  .then(() => {
    return data.gtmOnSuccess();
  })
  .catch((result) => {
    log({
      Name: 'GAdsConversionImprover',
      Type: 'Message',
      TraceId: traceId,
      EventName: 'Outmost .catch',
      Message: JSON.stringify(result)
    });
    return data.gtmOnFailure();
  });

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/**********************************************************************************************/
// Vendor related functions

function sendConversionRequestForConversionAdjustment() {
  const postUrlForConversionAdjustment = getUrlForConversionAdjustment();
  const postBodyForConversionAdjustment = getDataForConversionAdjustment();

  // No data available to send an ENHANCEMENT or RESTATEMENT. Abort.
  if (!postBodyForConversionAdjustment) {
    log({
      Name: 'GAdsConversionImprover',
      Type: 'Message',
      TraceId: traceId,
      EventName: makeString(data.conversionActionSource),
      Message:
        'Did not try to send Conversion Adjustment (ENHANCEMENT or RESTATEMENT).',
      Reason:
        'Missing required data: Transaction ID; or Conversion Value or User Identifiers.'
    });
    return Promise.create((resolve, reject) => reject());
  }

  const options = {
    headers: {
      'Content-Type': 'application/json',
      'login-customer-id': data.customerId,
    },
    method: 'POST'
  };

  if(data.authFlow === 'stape'){
    options.headers['x-gads-api-version']=apiVersion;
  }

  if (data.authFlow === 'own') {
    const auth = getGoogleAuth({
      scopes: ['https://www.googleapis.com/auth/adwords']
    });
    options.authorization = auth;
    options.headers['developer-token'] = data.developerToken;
  }

  log({
    Name: 'GAdsConversionImprover',
    Type: 'Request',
    TraceId: traceId,
    EventName: 'Adjustment ' + makeString(data.conversionActionSource),
    RequestMethod: 'POST',
    RequestUrl: postUrlForConversionAdjustment,
    RequestBody: postBodyForConversionAdjustment
  });

  return sendHttpRequest(
    postUrlForConversionAdjustment,
    options,
    JSON.stringify(postBodyForConversionAdjustment)
  ).then((result) => {
    // .then has to be used when the Authorization header is in use
    log({
      Name: 'GAdsConversionImprover',
      Type: 'Response',
      TraceId: traceId,
      EventName: 'Adjustment ' + makeString(data.conversionActionSource),
      ResponseStatusCode: result.statusCode,
      ResponseHeaders: result.headers,
      ResponseBody: result.body
    });

    if (result.statusCode >= 200 && result.statusCode < 400) {
      return result.body;
    } else {
      return Promise.create((resolve, reject) => reject());
    }
  });
}

function getUrlForConversionAdjustment() {
  if (data.authFlow === 'own') {
    return (
      'https://googleads.googleapis.com/v' +
      apiVersion +
      '/customers/' +
      enc(data.opCustomerId) +
      ':uploadConversionAdjustments'
    );
  }

  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');
  return (
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v2/gads/auth-proxy/adjustments'
  );
}

function getDataForConversionAdjustment() {
  let mappedData = {
    conversionAction:
      'customers/' +
      data.opCustomerId +
      '/conversionActions/' +
      data.conversionActionSource,
    adjustmentType: undefined
  };

  mappedData = addConversionAttributionForConversionAdjustment(
    eventData,
    mappedData
  );
  mappedData = addUserIdentifiers(eventData, mappedData);

  // Required for ENHANCEMENT (Always); and for RESTATEMENT (If Conversion Type is WEBPAGE. Always the case here.)
  if (!mappedData.orderId) return;

  if (mappedData.restatementValue) {
    mappedData.userIdentifiers = undefined; // It doesn't accept userIdentifiers.
    mappedData.adjustmentType = 'RESTATEMENT';
  } else if (
    mappedData.userIdentifiers &&
    mappedData.userIdentifiers.length > 0
  ) {
    // Note: Requires Enhanced Conversion managed through API in Google Ads (not GTM managed).
    // Note: Any restatement_value is ignored.
    mappedData.adjustmentType = 'ENHANCEMENT';
  }

  if (!mappedData.adjustmentType) return;

  return {
    conversionAdjustments: [mappedData],
    partialFailure: true,
    validateOnly: true // So that it doesn't actually execute it.
  };
}

function addConversionAttributionForConversionAdjustment(
  eventData,
  mappedData
) {
  // It must not use gclid, gbraid or wbraid in conjunction with Order ID.
  const adjustedValue = makeNumber(
    data.conversionValue ||
      eventData.conversionValue ||
      eventData.value ||
      eventData['x-ga-mp1-ev'] ||
      eventData['x-ga-mp1-tr']
  );
  const currencyCode =
    data.currencyCode || eventData.currencyCode || eventData.currency;

  if (getType(adjustedValue) === 'number' && currencyCode) {
    mappedData.restatementValue = {
      adjustedValue: adjustedValue,
      currencyCode: currencyCode
    };
  }

  if (data.orderId) mappedData.orderId = makeString(data.orderId);
  else if (eventData.orderId)
    mappedData.orderId = makeString(eventData.orderId);
  else if (eventData.order_id)
    mappedData.orderId = makeString(eventData.order_id);
  else if (eventData.transaction_id)
    mappedData.orderId = makeString(eventData.transaction_id);

  // No need to read it from anywhere. We are querying by Order ID.
  mappedData.adjustmentDateTime = getConversionDateTime();

  return mappedData;
}

function sendConversionRequestForOfflineConversion() {
  const postUrlForOfflineConversion = getUrlForOfflineConversion();
  const postBodyForOfflineConversion = getDataForOfflineConversion();

  const options = {
    headers: {
      'Content-Type': 'application/json',
      'login-customer-id': data.customerId
    },
    method: 'POST',
    timeout: 15000
  };

    if(data.authFlow === 'stape'){
    options.headers['x-gads-api-version']=apiVersion;
  }

  if (data.authFlow === 'own') {
    const auth = getGoogleAuth({
      scopes: ['https://www.googleapis.com/auth/adwords']
    });
    options.authorization = auth;
    options.headers['developer-token'] = data.developerToken;
  }

  log({
    Name: 'GAdsConversionImprover',
    Type: 'Request',
    TraceId: traceId,
    EventName:
      'Offline Conversion ' + makeString(data.conversionActionDestination),
    RequestMethod: 'POST',
    RequestUrl: postUrlForOfflineConversion,
    RequestBody: postBodyForOfflineConversion
  });

  return sendHttpRequest(
    postUrlForOfflineConversion,
    options,
    JSON.stringify(postBodyForOfflineConversion)
  ).then((result) => {
    // .then has to be used when the Authorization header is in use
    log({
      Name: 'GAdsConversionImprover',
      Type: 'Response',
      TraceId: traceId,
      EventName:
        'Offline Conversion ' + makeString(data.conversionActionDestination),
      ResponseStatusCode: result.statusCode,
      ResponseHeaders: result.headers,
      ResponseBody: result.body
    });

    if (!data.useOptimisticScenario) {
      if (result.statusCode >= 200 && result.statusCode < 400) {
        return Promise.create((resolve, reject) => resolve());
      } else {
        return Promise.create((resolve, reject) => reject());
      }
    }
  });
}

function getUrlForOfflineConversion() {
  if (data.authFlow === 'own') {
    return (
      'https://googleads.googleapis.com/v' +
      apiVersion +
      '/customers/' +
      enc(data.opCustomerId) +
      ':uploadClickConversions'
    );
  }

  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');
  return (
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v2/gads/auth-proxy'
  );
}

function getDataForOfflineConversion() {
  let mappedData = {
    conversionEnvironment: 'WEB',
    conversionAction:
      'customers/' +
      data.opCustomerId +
      '/conversionActions/' +
      data.conversionActionDestination
  };

  if (data.customDataList) {
    const customVariables = [];

    data.customDataList.forEach((d) => {
      customVariables.push({
        conversionCustomVariable:
          'customers/' +
          data.opCustomerId +
          '/conversionCustomVariables/' +
          d.conversionCustomVariable,
        value: d.value
      });
    });

    mappedData.customVariables = customVariables;
  }

  mappedData = addConversionAttributionForOfflineConversion(
    eventData,
    mappedData
  );
  mappedData = addCartDataForOfflineConversion(eventData, mappedData);
  mappedData = addUserIdentifiers(eventData, mappedData);
  mappedData = addConsentDataForOfflineConversion(mappedData);

  // Offline Conversions doesn't support addressInfo.
  if (mappedData.userIdentifiers && mappedData.userIdentifiers.addressInfo) {
    mappedData.userIdentifiers.addressInfo = undefined;
  }

  // Using userIndentifiers with gbraid/wbraid raises "VALUE_MUST_BE_UNSET". Should favor gbraid/wbraid.
  if ((mappedData.gbraid || mappedData.wbraid) && mappedData.userIdentifiers) {
    mappedData.userIdentifiers = undefined;
  }

  return {
    conversions: [mappedData],
    partialFailure: true,
    validateOnly:
      data.validateOnly === true || data.validateOnly === 'true' || false,
  };
}

function addConversionAttributionForOfflineConversion(eventData, mappedData) {
  const gbraid = data.gbraid || eventData.gbraid;
  const wbraid = data.wbraid || eventData.wbraid;
  const gclid = data.gclid || eventData.gclid;

  if (gclid) {
    mappedData.gclid = gclid;
  } else if (gbraid) {
    mappedData.gbraid = gbraid;
  } else if (wbraid) {
    mappedData.wbraid = wbraid;
  }

  if (data.conversionDateTime) {
    mappedData.conversionDateTime = getConversionDateTime(
      data.conversionDateTime
    );
  } else if (eventData.conversionDateTime) {
    mappedData.conversionDateTime = getConversionDateTime(
      eventData.conversionDateTime
    );
  } else mappedData.conversionDateTime = getConversionDateTime();

  return mappedData;
}

function addCartDataForOfflineConversion(eventData, mappedData) {
  let currencyFromItems = '';
  let valueFromItems = 0;
  let items = data.items;

  if (!items && eventData.items && eventData.items[0]) {
    items = [];
    currencyFromItems = eventData.items[0].currency;

    eventData.items.forEach((d, i) => {
      const item = {};

      if (d.item_id) item.productId = makeString(d.item_id);
      else if (d.id) item.productId = makeString(d.id);

      if (d.item_quantity) item.quantity = makeInteger(d.item_quantity);
      else if (d.quantity) item.quantity = makeInteger(d.quantity);

      if (d.item_price) {
        item.unitPrice = makeNumber(d.item_price);
        valueFromItems += item.quantity
          ? item.quantity * item.unitPrice
          : item.unitPrice;
      } else if (d.price) {
        item.unitPrice = makeNumber(d.price);
        valueFromItems += item.quantity
          ? item.quantity * item.unitPrice
          : item.unitPrice;
      }

      items[i] = item;
    });
  }

  if (
    items ||
    data.merchantId ||
    data.feedCountryCode ||
    data.feedLanguageCode ||
    data.localTransactionCost
  ) {
    mappedData.cartData = {};

    if (items) mappedData.cartData.items = items;

    if (data.merchantId) mappedData.cartData.merchantId = data.merchantId;
    else if (eventData.merchantId)
      mappedData.cartData.merchantId = eventData.merchantId;

    if (data.feedCountryCode)
      mappedData.cartData.feedCountryCode = data.feedCountryCode;
    else if (eventData.feedCountryCode)
      mappedData.cartData.feedCountryCode = eventData.feedCountryCode;

    if (data.feedLanguageCode)
      mappedData.cartData.feedLanguageCode = data.feedLanguageCode;
    else if (eventData.feedLanguageCode)
      mappedData.cartData.feedLanguageCode = eventData.feedLanguageCode;

    if (data.localTransactionCost)
      mappedData.cartData.localTransactionCost = makeNumber(
        data.localTransactionCost
      );
    else if (eventData.localTransactionCost)
      mappedData.cartData.localTransactionCost = eventData.localTransactionCost;
  }

  if (data.orderId) mappedData.orderId = makeString(data.orderId);
  else if (eventData.orderId)
    mappedData.orderId = makeString(eventData.orderId);
  else if (eventData.order_id)
    mappedData.orderId = makeString(eventData.order_id);
  else if (eventData.transaction_id)
    mappedData.orderId = makeString(eventData.transaction_id);

  if (data.conversionValue)
    mappedData.conversionValue = makeNumber(data.conversionValue);
  else if (eventData.value)
    mappedData.conversionValue = makeNumber(eventData.value);
  else if (eventData.conversionValue)
    mappedData.conversionValue = makeNumber(eventData.conversionValue);
  else if (eventData['x-ga-mp1-ev'])
    mappedData.conversionValue = makeNumber(eventData['x-ga-mp1-ev']);
  else if (eventData['x-ga-mp1-tr'])
    mappedData.conversionValue = makeNumber(eventData['x-ga-mp1-tr']);
  else if (valueFromItems)
    mappedData.conversionValue = makeNumber(valueFromItems);

  if (data.currencyCode) mappedData.currencyCode = data.currencyCode;
  else if (eventData.currencyCode)
    mappedData.currencyCode = eventData.currencyCode;
  else if (eventData.currency) mappedData.currencyCode = eventData.currency;
  else if (currencyFromItems) mappedData.currencyCode = currencyFromItems;

  return mappedData;
}

function addConsentDataForOfflineConversion(mappedData) {
  const adUserData = data.adUserData;
  const adPersonalization = data.adPersonalization;
  if (adUserData && adPersonalization) {
    mappedData.consent = {};

    if (adUserData) {
      mappedData.consent.adUserData = adUserData;
    }

    if (adPersonalization) {
      mappedData.consent.adPersonalization = adPersonalization;
    }
  }

  return mappedData;
}

function addUserIdentifiers(eventData, mappedData) {
  // Adjustments only accepts hashedEmail, hashedPhone and addressInfo.
  // Offline Conversions only accepts hashedEmail and hashedPhone.
  let hashedEmail;
  let hashedPhoneNumber;
  let addressInfo;
  let userIdentifiersMapped = [];
  let userEventData = {};
  const usedIdentifiers = [];

  if (getType(eventData.user_data) === 'object') {
    userEventData =
      eventData.user_data || eventData.user_properties || eventData.user;
  }

  if (data.userDataList) {
    const userIdentifiers = [];

    data.userDataList.forEach((d) => {
      const valueType = getType(d.value);
      const isValidValue =
        ['undefined', 'null'].indexOf(valueType) === -1 && d.value !== '';
      if (isValidValue) {
        const identifier = {};
        identifier[d.name] = hashData(d.name, d.value);
        identifier['userIdentifierSource'] = d.userIdentifierSource;

        userIdentifiers.push(identifier);
        usedIdentifiers.push(d.name);
      }
    });

    userIdentifiersMapped = userIdentifiers;
  }

  if (eventData.hashedEmail) hashedEmail = eventData.hashedEmail;
  else if (eventData.email) hashedEmail = eventData.email;
  else if (eventData.email_address) hashedEmail = eventData.email_address;
  else if (userEventData.email) hashedEmail = userEventData.email;
  else if (userEventData.email_address)
    hashedEmail = userEventData.email_address;

  if (usedIdentifiers.indexOf('hashedEmail') === -1 && hashedEmail) {
    userIdentifiersMapped.push({
      hashedEmail: hashData('hashedEmail', hashedEmail),
      userIdentifierSource: 'UNSPECIFIED'
    });
  }

  if (eventData.phone) hashedPhoneNumber = eventData.phone;
  else if (eventData.phone_number) hashedPhoneNumber = eventData.phone_number;
  else if (userEventData.phone) hashedPhoneNumber = userEventData.phone;
  else if (userEventData.phone_number)
    hashedPhoneNumber = userEventData.phone_number;

  if (
    usedIdentifiers.indexOf('hashedPhoneNumber') === -1 &&
    hashedPhoneNumber
  ) {
    userIdentifiersMapped.push({
      hashedPhoneNumber: hashData('hashedPhoneNumber', hashedPhoneNumber),
      userIdentifierSource: 'UNSPECIFIED'
    });
  }

  if (eventData.addressInfo) addressInfo = eventData.addressInfo;

  if (usedIdentifiers.indexOf('addressInfo') === -1 && addressInfo) {
    userIdentifiersMapped.push({
      addressInfo: addressInfo,
      userIdentifierSource: 'UNSPECIFIED'
    });
  }

  if (userIdentifiersMapped.length) {
    mappedData.userIdentifiers = userIdentifiersMapped;
  }

  return mappedData;
}

function getConversionDateTime(timestamp) {
  if (!timestamp) return convertTimestampToISO(getTimestampMillis());

  let timestampInt = makeInteger(timestamp);
  if (timestampInt && getType(timestampInt) === 'number') {
    const timestampString = makeString(timestamp);
    // This will be false only in 2286, when timestamps in seconds starts to have 11 digits.
    timestampInt = timestampString.length === 10 ? timestamp * 1000 : timestamp;
    return convertTimestampToISO(timestampInt);
  }

  return timestamp;
}

function hashData(key, value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'array') {
    return value.map((val) => {
      return hashData(key, val);
    });
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      const noHashNeeded =
        key === 'addressInfo' &&
        ['city', 'state', 'countryCode', 'postalCode'].indexOf(val) !== -1;
      acc[val] = noHashNeeded ? value[val] : hashData(key, value[val]);
      return acc;
    }, {});
  }

  if (isHashed(value)) {
    return value;
  }

  value = makeString(value).trim().toLowerCase();

  if (key === 'hashedPhoneNumber') {
    value = value
      .split(' ')
      .join('')
      .split('-')
      .join('')
      .split('(')
      .join('')
      .split(')')
      .join('');
  } else if (key === 'hashedEmail') {
    const valueParts = value.split('@');

    if (valueParts[1] === 'gmail.com' || valueParts[1] === 'googlemail.com') {
      value = valueParts[0].split('.').join('') + '@' + valueParts[1];
    } else {
      value = valueParts.join('@');
    }
  }

  return sha256Sync(value, { outputEncoding: 'hex' });
}

function convertTimestampToISO(timestamp) {
  const secToMs = function (s) {
    return s * 1000;
  };
  const minToMs = function (m) {
    return m * secToMs(60);
  };
  const hoursToMs = function (h) {
    return h * minToMs(60);
  };
  const daysToMs = function (d) {
    return d * hoursToMs(24);
  };
  const format = function (value) {
    return value >= 10 ? value.toString() : '0' + value;
  };
  const fourYearsInMs = daysToMs(365 * 4 + 1);
  let year = 1970 + Math.floor(timestamp / fourYearsInMs) * 4;
  timestamp = timestamp % fourYearsInMs;

  while (true) {
    const isLeapYear = !(year % 4);
    const nextTimestamp = timestamp - daysToMs(isLeapYear ? 366 : 365);
    if (nextTimestamp < 0) {
      break;
    }
    timestamp = nextTimestamp;
    year = year + 1;
  }

  const daysByMonth =
    year % 4 === 0
      ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
      : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let month = 0;
  for (let i = 0; i < daysByMonth.length; i++) {
    const msInThisMonth = daysToMs(daysByMonth[i]);
    if (timestamp > msInThisMonth) {
      timestamp = timestamp - msInThisMonth;
    } else {
      month = i + 1;
      break;
    }
  }
  const date = Math.ceil(timestamp / daysToMs(1));
  timestamp = timestamp - daysToMs(date - 1);
  const hours = Math.floor(timestamp / hoursToMs(1));
  timestamp = timestamp - hoursToMs(hours);
  const minutes = Math.floor(timestamp / minToMs(1));
  timestamp = timestamp - minToMs(minutes);
  const sec = Math.floor(timestamp / secToMs(1));

  return (
    year +
    '-' +
    format(month) +
    '-' +
    format(date) +
    ' ' +
    format(hours) +
    ':' +
    format(minutes) +
    ':' +
    format(sec) +
    '+00:00'
  );
}

/**********************************************************************************************/
// Helpers

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function enc(data) {
  return encodeUriComponent(data || '');
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled())
    logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery())
    logDestinationsHandlers.bigQuery = logToBigQuery;

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  const bigquery =
    getType(BigQuery) === 'function'
      ? BigQuery() /* Only during Unit Tests */
      : BigQuery;
  bigquery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}