# Provider country confirmation requests

Use these questions to obtain country-level information for Meta's App Review
data-handling form. Send each request through the provider's official support
or privacy channel while signed into the account used by Teviq. Do not include
customer messages, credentials, API keys, or other secrets.

## Render

Subject: Country locations for processing and support access

Hello Render Support,

I use Render to host Teviq's customer-support backend. The service is deployed
in Ohio, US. For a data-handling disclosure, could you confirm the countries
where (1) customer request/webhook data is processed or stored, (2) Render
personnel may access that data for support or operations, and (3) subprocessors
may process or access it? If a complete country list is not available, please
identify the applicable regions and explain how Render recommends customers
describe global or changing access locations.

Thank you.

## Supabase

Subject: Country locations for project data processing and support access

Hello Supabase Support,

I use Supabase for Teviq's production database, hosted in the Seoul region. For
a data-handling disclosure, could you confirm the countries where (1) this
project's database content and backups are stored or processed, (2) support,
security, or operations personnel may access project data, and (3) subprocessors
may process or access project data? Please distinguish the selected hosting
region from remote access and operational processing, and let me know if the
answer depends on my plan or contracting entity.

Thank you.

## Groq

Subject: Country locations and ZDR scope for Teviq's API use

Hello Groq Support,

I use Groq's Inference API to generate customer-support replies for Teviq. For
a data-handling disclosure, could you confirm the countries where (1) inference
inputs and outputs are processed, (2) personnel or subprocessors may access
them for support, operations, reliability, or abuse monitoring, and (3) any
retained usage or service data is stored? Please also confirm whether the
Inference API Zero Data Retention setting applies to the organization and API
key used for my production requests, and clarify what data ZDR does and does
not cover. Please identify any differences based on the Free plan.

Thank you.

## Before using any response in Meta's form

- Verify that the provider answered for the account, project, and service Teviq
  actually uses.
- Preserve the response and date in the compliance records; do not turn a
  region, company headquarters, or hosting location into an exhaustive access
  country list.
- If a provider cannot give a finite list, ask Meta how to represent global or
  variable access locations. Do not guess or submit a country list as complete.
- On 2026-10-18, the user identified the logged-in Groq Personal / Default
  Project as the account/project used for the production API key. The project
  showed Teviq API keys, and Inference APIs ZDR was enabled there. Global ZDR
  remains disabled; Batch and Fine-tuning/LoRA remain enabled. Do not describe
  this as global ZDR or as zero retention of all metadata.

## Request status (2026-10-18)

- Supabase: support request submitted; confirmation page says a response will
  be sent to the account email. No country details received yet.
- Render: support chat identifies the backend region as Ohio, US. Its response
  says public docs do not specify staff/subprocessor access countries or
  operational-log/telemetry locations. A human-team escalation was accepted;
  response is pending.
- Groq: support chat provided links to the data-retention docs, DPA, and Trust
  Center, but did not confirm the account-specific ZDR scope or exact staff and
  subprocessor access countries. Its public DPA says processing can occur in
  the US and other countries where Groq or subprocessors operate; this is not
  a finite country list. Treat those details as pending written confirmation.
- Meta's App Review data-handling form asks, for each processor, for its name,
  service category, and every country where Platform Data is processed or
  remotely accessed. The processor dialog was inspected but left unsaved because
  the country/access lists are not verified. Do not submit guessed countries.
- Based on the deployed architecture, likely processors to verify/list are
  Render (backend hosting), Supabase (database), and Groq (AI inference). Confirm
  the precise service categories and all processing/access countries before
  saving these entries in Meta.
