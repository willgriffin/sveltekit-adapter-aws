"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AWSAdapterStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_alpha_1 = require("@aws-cdk/aws-apigatewayv2-alpha");
const aws_apigatewayv2_integrations_alpha_1 = require("@aws-cdk/aws-apigatewayv2-integrations-alpha");
const dotenv_1 = require("dotenv");
class AWSAdapterStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c;
        super(scope, id, props);
        const routes = ((_a = process.env.ROUTES) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
        const projectPath = process.env.PROJECT_PATH;
        const serverPath = process.env.SERVER_PATH;
        const staticPath = process.env.STATIC_PATH;
        const prerenderedPath = process.env.PRERENDERED_PATH;
        const logRetention = parseInt(process.env.LOG_RETENTION_DAYS) || 7;
        const memorySize = parseInt(process.env.MEMORY_SIZE) || 128;
        const environment = (0, dotenv_1.config)({ path: projectPath });
        const [_, zoneName, ...MLDs] = ((_b = process.env.FQDN) === null || _b === void 0 ? void 0 : _b.split('.')) || [];
        const domainName = [zoneName, ...MLDs].join('.');
        this.serverHandler = new aws_cdk_lib_1.aws_lambda.Function(this, 'LambdaServerFunctionHandler', {
            code: new aws_cdk_lib_1.aws_lambda.AssetCode(serverPath),
            handler: 'index.handler',
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_16_X,
            timeout: aws_cdk_lib_1.Duration.minutes(15),
            memorySize,
            logRetention,
            environment: Object.assign({}, environment.parsed),
        });
        (_c = props === null || props === void 0 ? void 0 : props.serverHandlerPolicies) === null || _c === void 0 ? void 0 : _c.forEach((policy) => this.serverHandler.addToRolePolicy(policy));
        this.httpApi = new aws_apigatewayv2_alpha_1.HttpApi(this, 'API', {
            corsPreflight: {
                allowHeaders: ['*'],
                allowMethods: [aws_apigatewayv2_alpha_1.CorsHttpMethod.ANY],
                allowOrigins: ['*'],
                maxAge: aws_cdk_lib_1.Duration.days(1),
            },
            defaultIntegration: new aws_apigatewayv2_integrations_alpha_1.HttpLambdaIntegration('LambdaServerIntegration', this.serverHandler, {
                payloadFormatVersion: aws_apigatewayv2_alpha_1.PayloadFormatVersion.VERSION_1_0,
            }),
        });
        this.bucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'StaticContentBucket', {
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        if (process.env.FQDN) {
            this.hostedZone = aws_cdk_lib_1.aws_route53.HostedZone.fromLookup(this, 'HostedZone', {
                domainName: process.env.ZONE_NAME || domainName,
            });
            this.certificate = new aws_cdk_lib_1.aws_certificatemanager.DnsValidatedCertificate(this, 'DnsValidatedCertificate', {
                domainName: process.env.FQDN,
                hostedZone: this.hostedZone,
                region: 'us-east-1',
            });
        }
        const distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, 'CloudFrontDistribution', {
            priceClass: aws_cdk_lib_1.aws_cloudfront.PriceClass.PRICE_CLASS_100,
            enabled: true,
            defaultRootObject: '',
            sslSupportMethod: aws_cdk_lib_1.aws_cloudfront.SSLMethod.SNI,
            domainNames: process.env.FQDN ? [process.env.FQDN] : [],
            certificate: process.env.FQDN
                ? aws_cdk_lib_1.aws_certificatemanager.Certificate.fromCertificateArn(this, 'DomainCertificate', this.certificate.certificateArn)
                : undefined,
            defaultBehavior: {
                compress: true,
                origin: new aws_cdk_lib_1.aws_cloudfront_origins.HttpOrigin(aws_cdk_lib_1.Fn.select(1, aws_cdk_lib_1.Fn.split('://', this.httpApi.apiEndpoint)), {
                    protocolPolicy: aws_cdk_lib_1.aws_cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                }),
                viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_ALL,
                originRequestPolicy: new aws_cdk_lib_1.aws_cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
                    cookieBehavior: aws_cdk_lib_1.aws_cloudfront.OriginRequestCookieBehavior.all(),
                    queryStringBehavior: aws_cdk_lib_1.aws_cloudfront.OriginRequestQueryStringBehavior.all(),
                    headerBehavior: aws_cdk_lib_1.aws_cloudfront.OriginRequestHeaderBehavior.allowList('Origin', 'Accept-Charset', 'Accept', 'Access-Control-Request-Method', 'Access-Control-Request-Headers', 'Referer', 'Accept-Language', 'Accept-Datetime'),
                }),
                cachePolicy: aws_cdk_lib_1.aws_cloudfront.CachePolicy.CACHING_DISABLED,
            },
        });
        const s3Origin = new aws_cdk_lib_1.aws_cloudfront_origins.S3Origin(this.bucket, {});
        routes.forEach((route) => {
            distribution.addBehavior(route, s3Origin, {
                viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                originRequestPolicy: aws_cdk_lib_1.aws_cloudfront.OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
                cachePolicy: aws_cdk_lib_1.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
            });
        });
        if (process.env.FQDN) {
            new aws_cdk_lib_1.aws_route53.ARecord(this, 'ARecord', {
                recordName: process.env.FQDN,
                target: aws_cdk_lib_1.aws_route53.RecordTarget.fromAlias(new aws_cdk_lib_1.aws_route53_targets.CloudFrontTarget(distribution)),
                zone: this.hostedZone,
            });
        }
        new aws_cdk_lib_1.aws_s3_deployment.BucketDeployment(this, 'StaticContentDeployment', {
            destinationBucket: this.bucket,
            sources: [aws_cdk_lib_1.aws_s3_deployment.Source.asset(staticPath), aws_cdk_lib_1.aws_s3_deployment.Source.asset(prerenderedPath)],
            retainOnDelete: false,
            prune: true,
            distribution,
            distributionPaths: ['/*'],
        });
        new aws_cdk_lib_1.CfnOutput(this, 'appUrl', {
            value: process.env.FQDN ? `https://${process.env.FQDN}` : `https://${distribution.domainName}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'stackName', { value: id });
    }
}
exports.AWSAdapterStack = AWSAdapterStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRhcHRlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFkYXB0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsNkNBZXFCO0FBQ3JCLDRFQUEwRztBQUMxRyxzR0FBcUY7QUFDckYsbUNBQWdDO0FBV2hDLE1BQWEsZUFBZ0IsU0FBUSxtQkFBSztJQU94QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCOztRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLE1BQU0sR0FBRyxDQUFBLE1BQUEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLDBDQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSSxFQUFFLENBQUM7UUFDcEQsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUM7UUFDM0MsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUM7UUFDM0MsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQztRQUNyRCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRSxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZLENBQUMsSUFBSSxHQUFHLENBQUM7UUFDN0QsTUFBTSxXQUFXLEdBQUcsSUFBQSxlQUFNLEVBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUEsTUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUks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LGlCQUFpQixFQUFFLENBQUMsSUFBSSxDQUFDO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzVCLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsV0FBVyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLFlBQVksQ0FBQyxVQUFVLEVBQUU7U0FDL0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0Y7QUF2SUQsMENBdUlDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBTdGFja1Byb3BzLFxuICBTdGFjayxcbiAgRm4sXG4gIFJlbW92YWxQb2xpY3ksXG4gIER1cmF0aW9uLFxuICBDZm5PdXRwdXQsXG4gIGF3c19sYW1iZGEsXG4gIGF3c19zMyxcbiAgYXdzX3MzX2RlcGxveW1lbnQsXG4gIGF3c19jbG91ZGZyb250X29yaWdpbnMsXG4gIGF3c19jZXJ0aWZpY2F0ZW1hbmFnZXIsXG4gIGF3c19yb3V0ZTUzLFxuICBhd3Nfcm91dGU1M190YXJnZXRzLFxuICBhd3NfY2xvdWRmcm9udCxcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29yc0h0dHBNZXRob2QsIEh0dHBBcGksIElIdHRwQXBpLCBQYXlsb2FkRm9ybWF0VmVyc2lvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHsgY29uZmlnIH0gZnJvbSAnZG90ZW52JztcbmltcG9ydCB7IFBvbGljeVN0YXRlbWVudCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFXU0FkYXB0ZXJTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIEZRRE46IHN0cmluZztcbiAgYWNjb3VudD86IHN0cmluZztcbiAgcmVnaW9uPzogc3RyaW5nO1xuICBzZXJ2ZXJIYW5kbGVyUG9saWNpZXM/OiBQb2xpY3lTdGF0ZW1lbnRbXTtcbiAgem9uZU5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBV1NBZGFwdGVyU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIGJ1Y2tldDogYXdzX3MzLklCdWNrZXQ7XG4gIHNlcnZlckhhbmRsZXI6IGF3c19sYW1iZGEuSUZ1bmN0aW9uO1xuICBodHRwQXBpOiBJSHR0cEFwaTtcbiAgaG9zdGVkWm9uZTogYXdzX3JvdXRlNTMuSUhvc3RlZFpvbmU7XG4gIGNlcnRpZmljYXRlOiBhd3NfY2VydGlmaWNhdGVtYW5hZ2VyLklDZXJ0aWZpY2F0ZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQVdTQWRhcHRlclN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHByb2Nlc3MuZW52LlJPVVRFUz8uc3BsaXQoJywnKSB8fCBbXTtcbiAgICBjb25zdCBwcm9qZWN0UGF0aCA9IHByb2Nlc3MuZW52LlBST0pFQ1RfUEFUSDtcbiAgICBjb25zdCBzZXJ2ZXJQYXRoID0gcHJvY2Vzcy5lbnYuU0VSVkVSX1BBVEg7XG4gICAgY29uc3Qgc3RhdGljUGF0aCA9IHByb2Nlc3MuZW52LlNUQVRJQ19QQVRIO1xuICAgIGNvbnN0IHByZXJlbmRlcmVkUGF0aCA9IHByb2Nlc3MuZW52LlBSRVJFTkRFUkVEX1BBVEg7XG4gICAgY29uc3QgbG9nUmV0ZW50aW9uID0gcGFyc2VJbnQocHJvY2Vzcy5lbnYuTE9HX1JFVEVOVElPTl9EQVlTISkgfHwgNztcbiAgICBjb25zdCBtZW1vcnlTaXplID0gcGFyc2VJbnQocHJvY2Vzcy5lbnYuTUVNT1JZX1NJWkUhKSB8fCAxMjg7XG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSBjb25maWcoeyBwYXRoOiBwcm9qZWN0UGF0aCB9KTtcbiAgICBjb25zdCBbXywgem9uZU5hbWUsIC4uLk1MRHNdID0gcHJvY2Vzcy5lbnYuRlFETj8uc3BsaXQoJy4nKSB8fCBbXTtcbiAgICBjb25zdCBkb21haW5OYW1lID0gW3pvbmVOYW1lLCAuLi5NTERzXS5qb2luKCcuJyk7XG5cbiAgICB0aGlzLnNlcnZlckhhbmRsZXIgPSBuZXcgYXdzX2xhbWJkYS5GdW5jdGlvbih0aGlzLCAnTGFtYmRhU2VydmVyRnVuY3Rpb25IYW5kbGVyJywge1xuICAgICAgY29kZTogbmV3IGF3c19sYW1iZGEuQXNzZXRDb2RlKHNlcnZlclBhdGghKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGF3c19sYW1iZGEuUnVudGltZS5OT0RFSlNfMTZfWCxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZSxcbiAgICAgIGxvZ1JldGVudGlvbixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLmVudmlyb25tZW50LnBhcnNlZCxcbiAgICAgIH0gYXMgYW55LFxuICAgIH0pO1xuXG4gICAgcHJvcHM/LnNlcnZlckhhbmRsZXJQb2xpY2llcz8uZm9yRWFjaCgocG9saWN5KSA9PiB0aGlzLnNlcnZlckhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KHBvbGljeSkpO1xuXG4gICAgdGhpcy5odHRwQXBpID0gbmV3IEh0dHBBcGkodGhpcywgJ0FQSScsIHtcbiAgICAgIGNvcnNQcmVmbGlnaHQ6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbQ29yc0h0dHBNZXRob2QuQU5ZXSxcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgbWF4QWdlOiBEdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignTGFtYmRhU2VydmVySW50ZWdyYXRpb24nLCB0aGlzLnNlcnZlckhhbmRsZXIsIHtcbiAgICAgICAgcGF5bG9hZEZvcm1hdFZlcnNpb246IFBheWxvYWRGb3JtYXRWZXJzaW9uLlZFUlNJT05fMV8wLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICB0aGlzLmJ1Y2tldCA9IG5ldyBhd3NfczMuQnVja2V0KHRoaXMsICdTdGF0aWNDb250ZW50QnVja2V0Jywge1xuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBpZiAocHJvY2Vzcy5lbnYuRlFETikge1xuICAgICAgdGhpcy5ob3N0ZWRab25lID0gYXdzX3JvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICBkb21haW5OYW1lOiBwcm9jZXNzLmVudi5aT05FX05BTUUgfHwgZG9tYWluTmFtZSxcbiAgICAgIH0pIGFzIGF3c19yb3V0ZTUzLkhvc3RlZFpvbmU7XG5cbiAgICAgIHRoaXMuY2VydGlmaWNhdGUgPSBuZXcgYXdzX2NlcnRpZmljYXRlbWFuYWdlci5EbnNWYWxpZGF0ZWRDZXJ0aWZpY2F0ZSh0aGlzLCAnRG5zVmFsaWRhdGVkQ2VydGlmaWNhdGUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IHByb2Nlc3MuZW52LkZRRE4hLFxuICAgICAgICBob3N0ZWRab25lOiB0aGlzLmhvc3RlZFpvbmUsXG4gICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgYXdzX2Nsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uJywge1xuICAgICAgcHJpY2VDbGFzczogYXdzX2Nsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICcnLFxuICAgICAgc3NsU3VwcG9ydE1ldGhvZDogYXdzX2Nsb3VkZnJvbnQuU1NMTWV0aG9kLlNOSSxcbiAgICAgIGRvbWFpbk5hbWVzOiBwcm9jZXNzLmVudi5GUUROID8gW3Byb2Nlc3MuZW52LkZRRE4hXSA6IFtdLFxuICAgICAgY2VydGlmaWNhdGU6IHByb2Nlc3MuZW52LkZRRE5cbiAgICAgICAgPyBhd3NfY2VydGlmaWNhdGVtYW5hZ2VyLkNlcnRpZmljYXRlLmZyb21DZXJ0aWZpY2F0ZUFybihcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAnRG9tYWluQ2VydGlmaWNhdGUnLFxuICAgICAgICAgICAgdGhpcy5jZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFyblxuICAgICAgICAgIClcbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIG9yaWdpbjogbmV3IGF3c19jbG91ZGZyb250X29yaWdpbnMuSHR0cE9yaWdpbihGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJzovLycsIHRoaXMuaHR0cEFwaS5hcGlFbmRwb2ludCkpLCB7XG4gICAgICAgICAgcHJvdG9jb2xQb2xpY3k6IGF3c19jbG91ZGZyb250Lk9yaWdpblByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogYXdzX2Nsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBhd3NfY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXG4gICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IG5ldyBhd3NfY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5KHRoaXMsICdPcmlnaW5SZXF1ZXN0UG9saWN5Jywge1xuICAgICAgICAgIGNvb2tpZUJlaGF2aW9yOiBhd3NfY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0Q29va2llQmVoYXZpb3IuYWxsKCksXG4gICAgICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogYXdzX2Nsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFF1ZXJ5U3RyaW5nQmVoYXZpb3IuYWxsKCksXG4gICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGF3c19jbG91ZGZyb250Lk9yaWdpblJlcXVlc3RIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgICAnT3JpZ2luJyxcbiAgICAgICAgICAgICdBY2NlcHQtQ2hhcnNldCcsXG4gICAgICAgICAgICAnQWNjZXB0JyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1SZXF1ZXN0LU1ldGhvZCcsXG4gICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtUmVxdWVzdC1IZWFkZXJzJyxcbiAgICAgICAgICAgICdSZWZlcmVyJyxcbiAgICAgICAgICAgICdBY2NlcHQtTGFuZ3VhZ2UnLFxuICAgICAgICAgICAgJ0FjY2VwdC1EYXRldGltZSdcbiAgICAgICAgICApLFxuICAgICAgICB9KSxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGF3c19jbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgczNPcmlnaW4gPSBuZXcgYXdzX2Nsb3VkZnJvbnRfb3JpZ2lucy5TM09yaWdpbih0aGlzLmJ1Y2tldCwge30pO1xuICAgIHJvdXRlcy5mb3JFYWNoKChyb3V0ZSkgPT4ge1xuICAgICAgZGlzdHJpYnV0aW9uLmFkZEJlaGF2aW9yKHJvdXRlLCBzM09yaWdpbiwge1xuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogYXdzX2Nsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBhd3NfY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICBvcmlnaW5SZXF1ZXN0UG9saWN5OiBhd3NfY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LlVTRVJfQUdFTlRfUkVGRVJFUl9IRUFERVJTLFxuICAgICAgICBjYWNoZVBvbGljeTogYXdzX2Nsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGlmIChwcm9jZXNzLmVudi5GUUROKSB7XG4gICAgICBuZXcgYXdzX3JvdXRlNTMuQVJlY29yZCh0aGlzLCAnQVJlY29yZCcsIHtcbiAgICAgICAgcmVjb3JkTmFtZTogcHJvY2Vzcy5lbnYuRlFETixcbiAgICAgICAgdGFyZ2V0OiBhd3Nfcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyBhd3Nfcm91dGU1M190YXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQoZGlzdHJpYnV0aW9uKSksXG4gICAgICAgIHpvbmU6IHRoaXMuaG9zdGVkWm9uZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBhd3NfczNfZGVwbG95bWVudC5CdWNrZXREZXBsb3ltZW50KHRoaXMsICdTdGF0aWNDb250ZW50RGVwbG95bWVudCcsIHtcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB0aGlzLmJ1Y2tldCxcbiAgICAgIHNvdXJjZXM6IFthd3NfczNfZGVwbG95bWVudC5Tb3VyY2UuYXNzZXQoc3RhdGljUGF0aCEpLCBhd3NfczNfZGVwbG95bWVudC5Tb3VyY2UuYXNzZXQocHJlcmVuZGVyZWRQYXRoISldLFxuICAgICAgcmV0YWluT25EZWxldGU6IGZhbHNlLFxuICAgICAgcHJ1bmU6IHRydWUsXG4gICAgICBkaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogWycvKiddLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnYXBwVXJsJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3MuZW52LkZRRE4gPyBgaHR0cHM6Ly8ke3Byb2Nlc3MuZW52LkZRRE59YCA6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRvbWFpbk5hbWV9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ3N0YWNrTmFtZScsIHsgdmFsdWU6IGlkIH0pO1xuICB9XG59XG4iXX0=