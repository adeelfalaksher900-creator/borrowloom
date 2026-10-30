# Borrowloom

**Tagline:** Borrow the look. Keep the dates, care and privacy clear.

**Category:** Apparel VTO / eCommerce VTO

**Website:** https://borrowloom.vercel.app/

**Source:** https://github.com/adeelfalaksher900-creator/borrowloom

**Draft status:** Not submitted. Provider account activation and live inference verification remain release gates. Final screenshots and the public 1–3 minute video are reserved for the separately approved media phase.

## Inspiration

The dress for a wedding might already be in a friend's wardrobe. The difficult part is often everything around it: finding the photo in a chat, checking the measurements, agreeing the dates, and knowing whether the piece is back and ready for someone else.

Virtual try-on helps someone imagine an outfit. It does not coordinate a real loan. Borrowloom connects that moment of visual consideration to a private, practical borrowing workflow.

Research on clothing libraries and rental services points to occasional-use opportunities, but also barriers around availability, trust and day-to-day operations. We narrowed the product to existing personal circles. We do not assume that every rental is sustainable or claim that a preview proves physical fit.

## What it does

An owner creates an invitation-only wardrobe and adds a garment photograph, labelled size, actual measurements, condition and care instructions. Friends join through a private invitation, search the pieces and check collection and return dates.

A borrower can optionally open a private fitting room, consent to YouCam photo processing and request a visual preview. The owner sees the borrowing request, not the borrower's portrait or generated result. A preview is an illustration of appearance; the owner’s measurements and direct agreement remain essential.

The borrower requests a date window. The owner confirms or declines, records collection and marks the actual return. The calendar includes a fixed cleaning buffer, prevents conflicting confirmations and keeps overdue pieces unavailable. A pending request alone does not reserve the garment.

People can save an account recovery code and export their records. Owners can replace invitation links, remove a member after active requests are resolved, edit garment details with stale-version protection, and archive a piece that has no confirmed active borrowing.

The optional example wardrobe is clearly labelled. Its garments and photographs are fictional and are not offered for real-world borrowing.

## How we built it

Borrowloom uses a multipage frontend with semantic HTML, native dialogs, original responsive CSS and small JavaScript modules. It has a public homepage, wardrobes, garment details, borrowing history, a fitting room, account controls, a borrowing guide and a privacy page.

Vercel serves the website and forwards same-origin API requests to a dedicated Cloudflare Worker. A separate D1 database stores wardrobe membership, garment details, booking state and audit events. SQLite triggers enforce date conflicts inside storage, so a stale screen or simultaneous approval cannot decide availability.

The YouCam adapter registers the two input files, uploads them to signed storage destinations, creates a clothing-v4 task with strict single-person filtering, checks its status and stores its completed output privately. The API credential stays on the server. Each request has an idempotency key, current feature-cost and unit-balance checks, and atomic daily and total budgets. Ambiguous submissions are never automatically recreated as new billable tasks.

Provider errors pause polling rather than leaving an endless spinner. An explicit recheck retrieves the same task. Results expire after 24 hours, can be removed earlier, and are followed by a provider deletion request with scheduled retries.

**Current integration verification:** automated provider tests use mocked responses to verify the protocol and failure handling. A live YouCam inference is not yet verified because account activation is pending. The deployed fitting room reports unavailability honestly and does not fabricate an output. This draft must be updated with the observed live result before judging.

## Challenges

The important engineering work was at the boundaries. An actual early return must release later dates while retaining cleaning time. An overdue collected piece must remain blocked. A removed member must not submit an in-flight request after losing access. Two simultaneous recovery attempts must not both claim one code.

Private inference creates its own races. Deleting a preview during upload must not restart it, and a completed download must not resurrect an already-deleted image. We reproduced and fixed these cases, then added regression tests. We also corrected D1's binary-array response handling and ensured that a saved result cannot be displayed beside an unrelated portrait.

## Accomplishments

- A real deployed borrowing workflow, including photo upload, invitation-based membership, approval, collection, actual return and event history.
- Server- and storage-enforced authorization and date integrity, with isolated identities tested through the deployed interface.
- 32 automated tests covering domain rules, actual SQLite constraints, API permissions, recovery concurrency, exports and mocked provider lifecycle failures.
- A coherent product interface with original editorial imagery, useful empty and error states, keyboard-accessible controls and a mobile layout.
- Public source, an MIT license, diagrams, setup instructions, deployment guidance and an honest verification record.

These are engineering observations, not evidence of adoption, carbon savings or a measured improvement in borrowing behaviour.

## What we learned

A useful virtual-try-on product needs more than a generated image. The user's next decision is often whether the piece is genuinely available and what they need to agree with its owner. Privacy, care time, clear measurements and recoverable account access matter as much as the visual result.

## What's next

Complete live YouCam verification and the approved media phase. Then test the complete workflow with consenting garment owners and borrowers: time to find an available piece, request completion, understanding of the cleaning buffer and interpretation of preview limitations. Use those observations to prioritize improvements rather than inventing impact metrics.

## Built with

YouCam API clothing v4, JavaScript, HTML, CSS, Web Crypto, Cloudflare Workers, Cloudflare D1, SQLite, Vercel, Node.js, GitHub Actions, Phosphor Icons.

## References

- [Official hackathon requirements](https://youcam-api-skin-ai-ecommerce.devpost.com/)
- [Clothing libraries and occasional use](https://research-portal.uu.nl/en/publications/on-the-attractiveness-of-clothing-libraries-for-women-investigati/)
- [Empirical clothing-rental business research](https://www.tandfonline.com/doi/full/10.1080/15487733.2022.2065774)
- [YouCam clothing-v4 documentation](https://docs.perfectcorp.com/reference/ai_clothes/v4.0)

Team contributions must be entered only from actual confirmed work; no teammate role or enrolled-student status is invented.
