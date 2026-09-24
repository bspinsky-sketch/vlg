/**
 * VlgMail -- the report mailer.
 *
 * The page POSTs { token, contact, profile, toggles, ratings } to this
 * function's public URL and does not wait (text/plain, no-cors, keepalive --
 * the SMOMA pattern, handoff/README.md Part 3). The function renders the
 * multi-page PDF with the project's own WeasyPrint pipeline (output_report/)
 * and sends it through SES as a raw-MIME attachment.
 *
 * Built from two proven sources in the same AWS account:
 *   - PMTC handoff/infra/lib/mail-stack.ts: configuration set, bounce topic,
 *     public function URL with BOTH invoke permissions, concurrency cap.
 *   - K1x Application/infra/lib/mail-stack.ts (PmtcMail, live since 2026-08-28):
 *     sends from the already-verified geniusdrive.com identity WITHOUT
 *     declaring it, container image built from the repo root, explicit names.
 *
 * Guardrails this stack is written around (K1x CLAUDE_problems.md P052): the
 * account's scoped CDK execution role denies anything named Smoma*, the SES
 * configuration-set pattern ReportMail*, and every change to the apex
 * geniusdrive.com identity. So every resource here has an explicit vlg- name,
 * and the identity is only ever referenced as a string in an IAM policy.
 */
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

export interface MailStackProps extends StackProps {
  /** The project root: the Docker build context (scoped by the root .dockerignore). */
  readonly buildContext: string;
  /** The verified SES domain to send as. Referenced, never declared. */
  readonly sendingDomain: string;
  readonly sender?: string;
  readonly replyTo?: string;
  readonly notify?: string;
  readonly bcc?: string;
  /** Shared with static-site/report-config.js; read from that file by bin/app.ts. */
  readonly token: string;
}

export class MailStack extends Stack {
  constructor(scope: Construct, id: string, props: MailStackProps) {
    super(scope, id, props);

    const { sendingDomain, replyTo, notify, bcc, token } = props;
    const sender = props.sender ?? `reports@${sendingDomain}`;
    const functionName = 'vlg-report-mailer';

    const alerts = new sns.Topic(this, 'VlgMailAlerts', {
      topicName: 'vlg-report-mail-alerts',
      displayName: 'VLG report delivery problems',
    });
    if (notify) {
      alerts.addSubscription(new subscriptions.EmailSubscription(notify));
    }

    // Explicit name: a CDK-derived one comes from the construct ID alone and
    // can collide with the ReportMail* guardrail (P052).
    const configurationSet = new ses.ConfigurationSet(this, 'VlgReportMailEvents', {
      configurationSetName: 'vlg-report-mail',
      tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
      reputationMetrics: true,
    });
    configurationSet.addEventDestination('Problems', {
      destination: ses.EventDestination.snsTopic(alerts),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.REJECT,
      ],
    });

    const mailer = new lambda.DockerImageFunction(this, 'VlgReportMailer', {
      functionName,
      code: lambda.DockerImageCode.fromImageAsset(props.buildContext, {
        file: 'mailer/Dockerfile',
        // x86_64 rather than the kits' arm64: Ben's laptop is x86, so the image
        // builds natively instead of under emulation. Platform and architecture
        // must always be changed together (handoff README trap 11).
        platform: Platform.LINUX_AMD64,
      }),
      architecture: lambda.Architecture.X86_64,
      // Memory is really CPU on Lambda. A 16-page WeasyPrint render is far
      // lighter than K1x's Chromium, so 2048MB/120s leaves ample headroom.
      memorySize: 2048,
      timeout: Duration.seconds(120),
      // No reservedConcurrentExecutions. The PMTC handoff kit sets 5 to cap
      // abuse of the public URL, but this account's total Lambda concurrency
      // is so low that reserving ANY leaves less than AWS's required 10
      // unreserved, and the create fails (first VlgMail deploy, 2026-09-23;
      // CLAUDE_problems.md P041). K1x's PmtcMail also sets none. The token,
      // the fixed subject/body and the 120s timeout remain the guards.
      environment: {
        MAIL_SENDER: sender,
        MAIL_CONFIG_SET: configurationSet.configurationSetName,
        MAIL_TOKEN: token,
        ...(replyTo ? { MAIL_REPLY_TO: replyTo } : {}),
        ...(bcc ? { MAIL_BCC: bcc } : {}),
      },
      logGroup: new logs.LogGroup(this, 'VlgReportMailerLogs', {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      description: 'Renders the VLG report PDF and emails it via SES',
    });

    // SES v2 SendEmail with raw MIME authorises against ses:SendRawEmail too
    // (handoff trap 3), on both the identity and the configuration set.
    mailer.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [
        `arn:aws:ses:${this.region}:${this.account}:identity/${sendingDomain}`,
        `arn:aws:ses:${this.region}:${this.account}:configuration-set/${configurationSet.configurationSetName}`,
      ],
    }));

    const url = mailer.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    // Since Oct 2025 a public function URL needs lambda:InvokeFunction as well
    // as lambda:InvokeFunctionUrl, and addFunctionUrl writes only the latter.
    // Without this every request is a silent 403 (handoff README trap 2).
    new lambda.CfnPermission(this, 'VlgMailerInvokeViaUrl', {
      functionName: mailer.functionName,
      action: 'lambda:InvokeFunction',
      principal: '*',
      invokedViaFunctionUrl: true,
    });

    new CfnOutput(this, 'MailEndpoint', {
      value: url.url,
      description: 'Put this in static-site/report-config.js as apiUrl, then redeploy VlgSite',
    });
    new CfnOutput(this, 'MailSender', { value: sender, description: 'From address' });
    new CfnOutput(this, 'MailReplyTo', {
      value: replyTo ?? '(none - replies bounce into nowhere)',
      description: 'Where a reply goes. Repoint at go-live and redeploy',
    });
    new CfnOutput(this, 'MailBcc', { value: bcc ?? '(none)', description: 'Blind copy of every report' });
    new CfnOutput(this, 'MailerLogGroup', {
      value: `/aws/lambda/${functionName}`,
      description: 'The only place a failed send shows up',
    });
    new CfnOutput(this, 'AlertsTopicArn', { value: alerts.topicArn, description: 'Bounce/complaint/reject alerts' });
  }
}
