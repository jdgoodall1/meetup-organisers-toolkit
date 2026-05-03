#!/bin/bash
set -e

STACK_NAME="eventpush-landing"
REGION="us-east-1"

echo "=== Deploying landing page infrastructure ==="
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name $STACK_NAME \
  --region $REGION \
  --parameter-overrides \
    DomainName=eventpush.co.uk \
    CertificateArn=$1 \
  --no-fail-on-empty-changeset

echo ""
echo "=== Getting outputs ==="
BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text)
CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' --output text)

echo "Bucket: $BUCKET"
echo "Distribution ID: $DIST_ID"
echo "CloudFront domain: $CF_DOMAIN"

echo ""
echo "=== Uploading files ==="
aws s3 sync . s3://$BUCKET/ \
  --exclude "template.yaml" \
  --exclude "deploy.sh" \
  --exclude ".DS_Store" \
  --cache-control "public, max-age=3600"

echo ""
echo "=== Invalidating CloudFront cache ==="
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*" --output text

echo ""
echo "=== Done ==="
echo "Site will be available at: https://eventpush.co.uk"
echo "CloudFront domain: https://$CF_DOMAIN"
echo ""
echo "Point your DNS CNAME for eventpush.co.uk to: $CF_DOMAIN"
