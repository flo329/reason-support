/**
 * Built-in message templates (EN + ES). Agents can edit them in Settings → Templates.
 * {{placeholders}} are filled automatically; [[fill-ins]] must be replaced by the agent before sending.
 */
export interface TemplateDef {
  builtinKey: string;
  type: "CANCELLED" | "OUT_OF_STOCK" | "OVERSOLD" | "STUCK";
  language: "en" | "es";
  name: string;
  subject: string;
  body: string;
  sortOrder: number;
}

const SIGN_EN = `\n\nThanks for your patience,\n{{agent_name}}\nReason Clothing`;
const SIGN_ES = `\n\nGracias por tu paciencia,\n{{agent_name}}\nReason Clothing`;

const OPTIONS_EN = `Here are your options – just reply with the one you prefer:

1. Wait – we'll ship it as soon as it's back in stock (expected [[restock date]]).
2. Swap – choose a different size, color or item of the same value.
3. Refund – we'll refund the item(s) right away to your original payment method.`;

const OPTIONS_ES = `Estas son tus opciones – solo responde con la que prefieras:

1. Esperar – lo enviaremos en cuanto vuelva a estar disponible (fecha estimada [[fecha de reposición]]).
2. Cambiar – elige otra talla, color u otro artículo del mismo valor.
3. Reembolso – te reembolsamos el/los artículo(s) de inmediato a tu método de pago original.`;

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  // ---- Cancelled
  {
    builtinKey: "cancelled-en",
    type: "CANCELLED",
    language: "en",
    name: "Cancelled – general",
    subject: "About your Reason order {{order_number}}",
    body: `Hi {{customer_first_name}},

We're reaching out about your order {{order_number}}. Unfortunately it had to be cancelled ({{cancel_reason}}).

{{refund_status}}

We're really sorry for the inconvenience. If you'd still like these items, reply to this email and we'll help you place a new order.${SIGN_EN}`,
    sortOrder: 1,
  },
  {
    builtinKey: "cancelled-payment-en",
    type: "CANCELLED",
    language: "en",
    name: "Cancelled – payment / verification",
    subject: "Your Reason order {{order_number}}",
    body: `Hi {{customer_first_name}},

Your order {{order_number}} was cancelled because we couldn't verify the payment. This happens sometimes with automatic security checks and doesn't mean you did anything wrong.

{{refund_status}}

If you'd like to try again, you're welcome to place a new order, or reply here and we'll help you out.${SIGN_EN}`,
    sortOrder: 2,
  },
  {
    builtinKey: "cancelled-es",
    type: "CANCELLED",
    language: "es",
    name: "Cancelado – general",
    subject: "Sobre tu pedido {{order_number}} de Reason",
    body: `Hola {{customer_first_name}},

Te escribimos sobre tu pedido {{order_number}}. Lamentablemente tuvimos que cancelarlo ({{cancel_reason}}).

{{refund_status}}

Sentimos mucho las molestias. Si todavía quieres estos artículos, responde a este correo y te ayudamos a hacer un nuevo pedido.${SIGN_ES}`,
    sortOrder: 1,
  },
  // ---- Out of stock
  {
    builtinKey: "oos-en",
    type: "OUT_OF_STOCK",
    language: "en",
    name: "Out of stock – wait / swap / refund",
    subject: "An item in your order {{order_number}} is out of stock",
    body: `Hi {{customer_first_name}},

Thanks for your order {{order_number}}! Unfortunately the following item(s) are currently out of stock:

{{items}}

${OPTIONS_EN}

Sorry about this – we'll take care of it as soon as we hear from you.${SIGN_EN}`,
    sortOrder: 1,
  },
  {
    builtinKey: "oos-es",
    type: "OUT_OF_STOCK",
    language: "es",
    name: "Agotado – esperar / cambiar / reembolso",
    subject: "Un artículo de tu pedido {{order_number}} está agotado",
    body: `Hola {{customer_first_name}},

¡Gracias por tu pedido {{order_number}}! Lamentablemente los siguientes artículos están agotados en este momento:

{{items}}

${OPTIONS_ES}

Perdona las molestias – lo resolvemos en cuanto nos respondas.${SIGN_ES}`,
    sortOrder: 1,
  },
  // ---- Oversold
  {
    builtinKey: "oversold-en",
    type: "OVERSOLD",
    language: "en",
    name: "Oversold – wait / swap / refund",
    subject: "Update on your order {{order_number}}",
    body: `Hi {{customer_first_name}},

Thanks for your order {{order_number}}. Demand for the item(s) below was higher than expected and we sold more than we had in stock:

{{items}}

${OPTIONS_EN}

We're sorry for the mix-up and appreciate your understanding.${SIGN_EN}`,
    sortOrder: 1,
  },
  {
    builtinKey: "oversold-es",
    type: "OVERSOLD",
    language: "es",
    name: "Sobreventa – esperar / cambiar / reembolso",
    subject: "Novedades sobre tu pedido {{order_number}}",
    body: `Hola {{customer_first_name}},

Gracias por tu pedido {{order_number}}. La demanda de los siguientes artículos fue mayor de lo esperado y vendimos más unidades de las que teníamos:

{{items}}

${OPTIONS_ES}

Sentimos la confusión y agradecemos tu comprensión.${SIGN_ES}`,
    sortOrder: 1,
  },
  // ---- Delayed
  {
    builtinKey: "delayed-en",
    type: "STUCK",
    language: "en",
    name: "Delayed shipment",
    subject: "Your order {{order_number}} is on its way soon",
    body: `Hi {{customer_first_name}},

We wanted to give you a quick heads-up: your order {{order_number}} is taking a little longer than usual to ship. We expect it to leave our warehouse by [[ship date]], and you'll get a tracking link as soon as it does.

{{items}}

If you have any questions in the meantime, just reply to this email.${SIGN_EN}`,
    sortOrder: 1,
  },
  {
    builtinKey: "delayed-es",
    type: "STUCK",
    language: "es",
    name: "Envío retrasado",
    subject: "Tu pedido {{order_number}} sale muy pronto",
    body: `Hola {{customer_first_name}},

Queríamos avisarte de que tu pedido {{order_number}} está tardando un poco más de lo habitual en enviarse. Esperamos que salga de nuestro almacén antes del [[fecha de envío]] y te mandaremos el enlace de seguimiento en cuanto salga.

{{items}}

Si tienes cualquier pregunta mientras tanto, responde a este correo.${SIGN_ES}`,
    sortOrder: 1,
  },
];
