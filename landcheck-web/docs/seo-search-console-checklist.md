# SEO and Organic Measurement Checklist

## Google Search Console

- [ ] Verify the `landcheck.online` domain property in Google Search Console using the DNS TXT method at the domain registrar.
- [ ] Submit `https://landcheck.online/sitemap.xml` under **Indexing > Sitemaps**.
- [ ] Inspect the homepage and the public `/estates/`, `/survey/`, `/flood/`, `/green-partners/`, `/sponsor/`, `/news/`, and `/privacy/` URLs.
- [ ] Confirm that the inspected URL is crawlable, has the expected canonical URL, and is not blocked by `robots.txt`.
- [ ] Request indexing only for important new or corrected public URLs; do not repeatedly submit unchanged pages.
- [ ] Review **Page indexing**, **Crawl stats**, **Core Web Vitals**, and **HTTPS** reports weekly during the first month.
- [ ] Check the duplicate, alternate-canonical, redirect, and soft-404 reports after the next crawl cycle.

## Analytics and conversions

- [ ] Create or confirm a GA4 web data stream for `https://landcheck.online` and install its measurement ID through the existing consent-controlled analytics integration.
- [ ] Mark these events as conversions: `estate_demo_request`, `estate_trial_start`, `survey_workspace_open`, `hazard_report_start`, `sponsor_checkout_start`, and `sponsor_payment_success`.
- [ ] Keep payment success server-confirmed; never mark a sponsorship conversion from a client-only checkout click.
- [ ] Add a `contact_submit` conversion for qualified sales or partnership enquiries and include product context in the event parameters.
- [ ] Verify every conversion in GA4 DebugView and in the browser network panel before using it for reporting.
- [ ] Link GA4 and Search Console, then build a report combining landing page, query, country, device, engagement, and conversion data.
- [ ] Exclude internal staff traffic and test accounts from conversion reports where possible.

## Campaign attribution

- [ ] Use consistent UTM tags for paid, partner, social, email, and YouTube links.
- [ ] Use `utm_source`, `utm_medium`, `utm_campaign`, and, where useful, `utm_content`; keep campaign names lowercase and stable.
- [ ] Preserve the first landing-page and campaign attribution through signup and demo forms.
- [ ] Add a campaign identifier to QR codes and offline estate-company outreach so leads can be compared with organic traffic.
- [ ] Do not put personal or payment information in URLs or analytics parameters.

## Monthly review

- [ ] Compare branded and non-branded Search Console clicks, impressions, CTR, and average position.
- [ ] Compare organic landing-page sessions with qualified enquiries, workspace starts, trial starts, and completed sponsorship payments.
- [ ] Investigate pages with impressions but low CTR before creating new content: title, description, canonical, and search intent come first.
- [ ] Investigate pages with traffic but no conversion using page-specific calls to action and form completion data.
- [ ] Record changes to titles, schema, pricing, redirects, and campaigns so measurement changes are not mistaken for demand changes.
