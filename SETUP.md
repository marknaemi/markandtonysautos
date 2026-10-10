# Putting markandtonysautos.com live on AWS

This folder is the whole website: the page design, the owner login, the inventory (cars, photos and prices) and the booking form that emails rent@markandtonysautos.com. It runs on **AWS Amplify**, which hosts the site and creates everything else automatically: owner logins (Cognito), the inventory database (DynamoDB), photo storage (S3) and the email sender (Lambda and SES).

Expected cost at your size: a few dollars a month or less, and much of it falls under the AWS free tier.

## What you'll need
- An AWS account (aws.amazon.com), signed in as the account owner or an admin
- A GitHub account (github.com, free). Amplify deploys the site from GitHub, so every change goes live automatically.
- Your Namecheap login (that's where markandtonysautos.com is registered)
- An inbox for rent@markandtonysautos.com (Google Workspace, Microsoft 365, Zoho or similar). Booking requests are emailed there.

## Step 1. Put the code on GitHub (about 5 minutes)
1. On github.com, create a **private** repository named `markandtonysautos`. Leave it empty, with no README.
2. Then do one of these:
   - **Easiest:** connect GitHub to Claude (claude.ai → Settings → GitHub) and tell me the repo name. I'll push the code and keep it updated.
   - **Or by hand:** unzip `markandtonysautos-site.zip`, then on the repo page click "uploading an existing file" and drag in everything inside the folder.

## Step 2. Create the Amplify app (about 10 minutes, then about 10 minutes of building)
1. In the AWS console, set the region (top right) to **US West (Oregon) us-west-2**. Use this same region in every step.
2. Open **AWS Amplify** → **Create new app** → **GitHub** → authorize → pick `markandtonysautos` and the `main` branch.
3. Amplify reads `amplify.yml` from the code and needs no other settings. Click **Save and deploy**.
4. Wait for the build to show **Deployed**. You'll get a temporary address like `main.d123abc.amplifyapp.com`. Open it and the site should load with an empty fleet.

## Step 3. Create the owner logins (about 5 minutes)
Nobody can sign up from the website. Owners are added here:
1. In the AWS console, open **Cognito** → **User pools**. Pick the pool whose name starts with `amplifyAuthUserPool`.
2. Click **Users** → **Create user**. Enter Mark's email, choose "Send an email invitation", and let it generate a temporary password.
3. Repeat for Tony.
4. On the website, click **Owner login** at the bottom of the page and sign in with the temporary password. It will ask you to choose your own password. You'll then see the owner bar and can add cars, photos and prices.

## Step 3.5. Let AWS manage the domain's DNS (about 10 minutes, plus up to 24 hours of waiting)
The domain stays registered and renewed at Namecheap. You're only telling Namecheap that AWS now answers for its DNS, which lets steps 4 and 5 set themselves up with one click. It costs about $0.50 a month.

1. In the AWS console, open **Route 53** → **Hosted zones** → **Create hosted zone**. Enter `markandtonysautos.com`, choose **Public hosted zone**, and click Create.
2. Open the new zone. Find the **NS** record, which lists 4 server names like `ns-123.awsdns-45.com`. Keep this tab open.
3. In Namecheap: **Domain List** → **Manage** next to markandtonysautos.com → **Nameservers** → choose **Custom DNS** → enter the 4 AWS names (without the trailing dot) → click the green check.
4. The change usually takes effect within an hour, but it can take up to 24 hours.

**If you already set up email at Namecheap** (Private Email, or Google/Microsoft records added in Namecheap's Advanced DNS), copy those MX and TXT records into the Route 53 zone before step 3. Otherwise email to the domain stops working until you do.

## Step 4. Let the booking form send email (about 10 minutes, plus DNS wait)
1. Open **Amazon SES** (same region) → **Identities** → **Create identity** → **Domain** → `markandtonysautos.com`.
2. SES shows a few DNS records (DKIM). Because the domain now uses Route 53 (step 3.5), click the button to publish them automatically.
3. Wait for the identity to show **Verified** (minutes to a few hours).
4. Test it by submitting the form on the site. The request should arrive at rent@markandtonysautos.com, and hitting Reply answers the customer directly.

Because requests only go to your own verified address, you don't need to ask SES for "production access".

## Step 5. Connect the domain (about 10 minutes, plus DNS wait)
1. In Amplify, open your app → **Hosting** → **Custom domains** → **Add domain** → `markandtonysautos.com`.
2. Amplify sees the Route 53 zone from step 3.5 and adds the records itself. Keep both `markandtonysautos.com` and `www` selected.
3. Amplify creates the free SSL certificate. Within about an hour, both https://markandtonysautos.com and www should open the site.

## Before you announce the site
- Make sure your commercial rental insurance is active.
- Replace the example prices and add photos for each car.
- Send one test booking request and confirm it arrives.

## How it's built (for reference)
- `index.html`, `src/` is the website itself (Vite, plain JavaScript).
- `amplify/auth` sets up owner sign-in. Self sign-up is off, see `amplify/backend.ts`.
- `amplify/data` holds the `Car` inventory table and the `requestBooking` action. Visitors can read cars, and only signed-in owners can change them.
- `amplify/storage` stores car photos under `car-photos/`. Visitors can view them, and only owners can upload or delete.
- `amplify/functions/send-request` is the function that emails booking requests through SES. The addresses are set in its `resource.ts`.
- `npm install`, then `npm run dev` previews it locally (needs `amplify_outputs.json`, which Amplify generates).
