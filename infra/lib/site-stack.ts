/**
 * VlgSite -- static-site/ served from a private S3 bucket behind CloudFront.
 *
 * Based on Tristen's GD_TOOLS static-site-cdk kit (lib/site-stack.ts, 2026-09-22),
 * which serves a single tool.html. The one structural change: VLG is several
 * files (index.html + JS/CSS/components/icons), so the whole static-site/
 * folder is staged instead, the way the PMTC handoff kit's StaticSiteStack
 * does it. Everything else -- private bucket with Origin Access Control, HTTPS
 * redirect, no 403/404 rewrite, cache invalidation on every deploy, the shared
 * *.geniusdrive.com wildcard -- is the kit unchanged.
 *
 * What the page reaches for (verified against static-site/ source, 2026-09-23):
 * the Google Fonts stylesheet, HubSpot's Forms API (once hubspot-config.js is
 * filled in), the VlgMail function URL (report-config.js) and the Apps Script
 * capture URL (capture-config.js). The CSP below carries frame-ancestors only,
 * so none of those are affected.
 *
 * DNS for geniusdrive.com is at GoDaddy, not Route 53, so the CNAME pointing
 * vlg.geniusdrive.com at the distribution is added there by hand, from the
 * DistributionDomainName output.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

export interface SiteStackProps extends StackProps {
  /** The folder to serve (static-site/). */
  readonly contentPath: string;
  /** vlg.geniusdrive.com. Optional: without it the site serves on its *.cloudfront.net name. */
  readonly domainName?: string;
  /** The shared wildcard certificate. Goes together with domainName. */
  readonly certificateArn?: string;
}

/**
 * Files in static-site/ that are development tools, not part of the site.
 * data.json is the raw extract that data.js already embeds; extract_data.py is
 * the workbook extractor. Neither is requested by the page, so neither ships.
 */
function shipsWithSite(name: string): boolean {
  if (name.startsWith('.')) return false;
  if (name === '__pycache__') return false;
  if (name.endsWith('.py') || name.endsWith('.pyc')) return false;
  if (name === 'data.json') return false;
  return true;
}

export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const { contentPath, domainName, certificateArn } = props;

    if (Boolean(domainName) !== Boolean(certificateArn)) {
      throw new Error('domain and certArn go together in cdk.json: set both or neither.');
    }
    if (!fs.existsSync(path.join(contentPath, 'index.html'))) {
      throw new Error(`No index.html in ${contentPath}.`);
    }

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'SiteCertificate', certificateArn)
      : undefined;

    // Never reached directly: Origin Access Control is the only reader.
    // DESTROY is safe because every object here is a copy of a file in git.
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // VLG is a standalone page (Ben, 2026-09-23), so framing is denied. If it
    // ever needs embedding in another site's iframe, delete `frameOptions` and
    // `contentSecurityPolicy` below and redeploy -- that is the whole change on
    // this side (GD_TOOLS static_site_cdk.md, "If the tool has to be embedded").
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SiteHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          preload: false,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: "frame-ancestors 'none'",
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: `VLG Assessment - ${domainName ?? 'no domain yet'}`,
      defaultRootObject: 'index.html',
      ...(domainName && certificate ? { domainNames: [domainName], certificate } : {}),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
      },
      // No catch-all 403/404 -> index.html rewrite, on purpose (kit LESSONS D4):
      // the page has no routes, and the rewrite would answer every stray
      // /favicon.ico-style request with the whole page.
    });

    // Stage a filtered copy of static-site/ so dev files never ship.
    const staging = path.join(__dirname, '..', '.staging');
    fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(contentPath, staging, {
      recursive: true,
      filter: (src) => shipsWithSite(path.basename(src)) || path.resolve(src) === path.resolve(contentPath),
    });

    new s3deploy.BucketDeployment(this, 'SiteContent', {
      sources: [s3deploy.Source.asset(staging)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
      // Multi-file site: browsers must revalidate on every load (a cheap 304),
      // or a visitor could get a new index.html with yesterday's app.js from
      // their own browser cache. CloudFront itself still caches for a day
      // (s-maxage) and is invalidated by this deployment anyway.
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=0, s-maxage=86400, must-revalidate')],
    });

    new CfnOutput(this, 'SiteUrl', {
      value: domainName ? `https://${domainName}/` : `https://${distribution.distributionDomainName}/`,
      description: 'Where the site is served',
    });
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'GoDaddy CNAME: Name "vlg", Value = this',
    });
    new CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}/`,
      description: 'Always works, needs no DNS. The fallback if the domain is ever in doubt',
    });
    new CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'Origin bucket, reachable only through the distribution',
    });
  }
}
