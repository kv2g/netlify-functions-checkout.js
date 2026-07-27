const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Set these in Netlify: Site settings > Environment variables
//   STRIPE_WEBHOOK_SECRET   -> from Stripe Dashboard > Developers > Webhooks
//   GOOGLE_SHEET_WEBHOOK_URL -> the /exec URL from your Apps Script deployment

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const meta = session.metadata || {};

    const orderPayload = {
      orderId: session.id,
      customerName: meta.customerName || '',
      customerEmail: session.customer_email || meta.customerEmail || '',
      customerAddress: meta.customerAddress || '',
      tiffinType: meta.tiffinType || '',
      daysCount: meta.daysCount || '',
      dayNames: meta.dayNames || '',
      deliveryMethod: meta.deliveryMethod || '',
      notes: meta.notes || '',
      amountPaid: session.amount_total ? (session.amount_total / 100).toFixed(2) : ''
    };

    try {
      await fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
    } catch (err) {
      // Log but still return 200 to Stripe — we don't want Stripe retrying
      // forever just because the Sheet write failed. Check Netlify function
      // logs if orders stop appearing in the sheet.
      console.error('Failed to write order to Google Sheet:', err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
