import {SES} from '@aws-sdk/client-ses';

import {
  AWS_SES_ACCESS_KEY_ID,
  AWS_SES_REGION,
  AWS_SES_SECRET_ACCESS_KEY,
  SES_CONFIGURATION_SET,
  SES_CONFIGURATION_SET_NO_TRACKING,
} from '../app/constants.js';

/**
 * AWS SES Client
 */
export const ses = new SES({
  apiVersion: '2010-12-01',
  region: AWS_SES_REGION,
  credentials: {
    accessKeyId: AWS_SES_ACCESS_KEY_ID,
    secretAccessKey: AWS_SES_SECRET_ACCESS_KEY,
  },
});

interface SendRawEmailParams {
  from: {
    name: string;
    email: string;
  };
  to: string[];
  content: {
    subject: string;
    html: string;
  };
  reply?: string;
  headers?: Record<string, string> | null;
  attachments?:
    | {
        filename: string;
        content: string; // Base64 encoded
        contentType: string;
      }[]
    | null;
  tracking?: boolean;
}

/**
 * Break long lines to comply with email RFC standards
 */
function breakLongLines(input: string, maxLineLength: number, isBase64 = false): string {
  if (isBase64) {
    // For base64 content, break at exact intervals without looking for spaces
    const result = [];
    for (let i = 0; i < input.length; i += maxLineLength) {
      result.push(input.substring(i, i + maxLineLength));
    }
    return result.join('\n');
  } else {
    // For text content, break at spaces when possible
    const lines = input.split('\n');
    const result = [];
    for (let line of lines) {
      while (line.length > maxLineLength) {
        let pos = maxLineLength;
        while (pos > 0 && line[pos] !== ' ') {
          pos--;
        }
        if (pos === 0) {
          pos = maxLineLength;
        }
        result.push(line.substring(0, pos));
        line = line.substring(pos).trim();
      }
      result.push(line);
    }
    return result.join('\n');
  }
}

/**
 * Send a raw email via AWS SES with full MIME formatting
 */
export async function sendRawEmail({
  from,
  to,
  content,
  reply,
  headers,
  attachments,
  tracking = true,
}: SendRawEmailParams): Promise<{messageId: string}> {
  // Check if the body contains an unsubscribe link
  const regex = /unsubscribe\/([a-f\d-]+)"/;
  const containsUnsubscribeLink = regex.exec(content.html);

  let unsubscribeHeader = '';
  if (containsUnsubscribeLink?.[1]) {
    const unsubscribeId = containsUnsubscribeLink[1];
    unsubscribeHeader = `List-Unsubscribe: <https://app.useplunk.com/unsubscribe/${unsubscribeId}>`;
  }

  // Generate unique boundaries for multipart messages
  const boundary = `----=_NextPart_${Math.random().toString(36).substring(2)}`;
  const mixedBoundary = attachments?.length ? `----=_MixedPart_${Math.random().toString(36).substring(2)}` : null;

  // Build raw MIME message
  const rawMessage = `From: ${from.name} <${from.email}>
To: ${to.join(', ')}
Reply-To: ${reply || from.email}
Subject: ${content.subject}
MIME-Version: 1.0
${
  mixedBoundary
    ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
    : `Content-Type: multipart/alternative; boundary="${boundary}"`
}
${
  headers
    ? Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    : ''
}
${unsubscribeHeader}

${mixedBoundary ? `--${mixedBoundary}\n` : ''}${
    mixedBoundary ? `Content-Type: multipart/alternative; boundary="${boundary}"\n\n` : ''
  }--${boundary}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 7bit

${breakLongLines(content.html, 500)}
--${boundary}--
${
  attachments?.length
    ? attachments
        .map(
          attachment => `
--${mixedBoundary}
Content-Type: ${attachment.contentType}
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${attachment.filename}"

${breakLongLines(attachment.content, 76, true)}
`,
        )
        .join('\n')
    : ''
}${mixedBoundary ? `\n--${mixedBoundary}--` : ''}`;

  // Send via SES
  const response = await ses.sendRawEmail({
    Destinations: to,
    ConfigurationSetName: tracking ? SES_CONFIGURATION_SET : SES_CONFIGURATION_SET_NO_TRACKING,
    RawMessage: {
      Data: new TextEncoder().encode(rawMessage),
    },
    Source: `${from.name} <${from.email}>`,
  });

  if (!response.MessageId) {
    throw new Error('Could not send email');
  }

  return {messageId: response.MessageId};
}

/**
 * Get verification attributes for multiple domain identities
 */
export const getIdentities = async (domains: string[]): Promise<{domain: string; status: string}[]> => {
  const res = await ses.getIdentityVerificationAttributes({
    Identities: domains,
  });

  const parsedResult = Object.entries(res.VerificationAttributes ?? {});
  return parsedResult.map(obj => {
    return {domain: obj[0], status: obj[1].VerificationStatus ?? 'NotStarted'};
  });
};

/**
 * Verify a domain and get DKIM tokens for DNS configuration
 */
export const verifyDomain = async (domain: string): Promise<string[]> => {
  // Verify DKIM for the domain
  const DKIM = await ses.verifyDomainDkim({Domain: domain});

  // Set custom MAIL FROM domain (plunk.yourdomain.com)
  await ses.setIdentityMailFromDomain({
    Identity: domain,
    MailFromDomain: `plunk.${domain}`,
  });

  return DKIM.DkimTokens ?? [];
};

/**
 * Get DKIM verification attributes for a domain
 */
export const getDomainVerificationAttributes = async (domain: string) => {
  const attributes = await ses.getIdentityDkimAttributes({
    Identities: [domain],
  });

  const parsedAttributes = Object.entries(attributes.DkimAttributes ?? {});

  if (parsedAttributes.length === 0) {
    return {
      domain,
      tokens: [],
      status: 'NotStarted',
    };
  }

  const firstAttribute = parsedAttributes[0];
  if (!firstAttribute) {
    return {
      domain,
      tokens: [],
      status: 'NotStarted',
    };
  }

  return {
    domain: firstAttribute[0],
    tokens: firstAttribute[1].DkimTokens ?? [],
    status: firstAttribute[1].DkimVerificationStatus ?? 'NotStarted',
  };
};

/**
 * Disable bounce/complaint forwarding for a verified domain
 */
export const disableFeedbackForwarding = async (domain: string): Promise<void> => {
  await ses.setIdentityFeedbackForwardingEnabled({
    Identity: domain,
    ForwardingEnabled: false,
  });
};
