# Borrowloom research and decision record

Research date: 30 October 2026. This is a new project for the YouCam API Skin AI & eCommerce VTO Hackathon. No existing Adeel project is reused or modified.

## Competition requirements

The [official event](https://youcam-api-skin-ai-ecommerce.devpost.com/) and [rules](https://youcam-api-skin-ai-ecommerce.devpost.com/rules) require a functioning application integrating a YouCam API, source with setup instructions and suitable licensing, a clear English description, judge access through the judging period, screenshots and a public 1–3 minute end-to-end video explaining the integration. Submission closes **2 November 2026, 21:45 Pakistan time**. Four equally weighted criteria cover implementation, design, impact and idea quality; implementation breaks ties first. A prototype is the minimum permitted deliverable; our target is a usable borrowing workflow.

Selected topic: **eCommerce VTO / Apparel VTO**. Registered participants are offered 1,000 units; account activation and the actual balance must be verified before spending. There is no mandatory framework, cloud vendor or agent architecture. Special awards require actual eligibility; no student-enrollment or gender claim is inferred. Social sharing is optional and does not affect scores. Media production and final submission remain outside this phase.

The [organizer's judge-access clarification](https://youcam-api-skin-ai-ecommerce.devpost.com/forum_topics/45693-judge-access-local-test-build-with-recorded-api-result-and-gated-fresh-inference) accepts a working free build with accurately labelled recorded real API responses. This does not authorize fabricated results.

## Options evaluated

These are design assessments, not measured user outcomes or probabilities of winning. Each rating is 1–5; higher is preferable.

| Direction | User problem | Evidence / competitive issue | Originality | Value | Feasibility | API depth | Demonstrability |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Skincare change journal | Knowing whether a routine is helping | Assay and EstiSeries already address progress and uncertainty; causal or medical claims need evidence | 2 | 4 | 3 | 4 | 4 |
| Resale listing try-on | Imagining a one-off used item before buying | Wardrobe Connect already combines live eBay listings and YouCam | 2 | 4 | 4 | 4 | 5 |
| Wardrobe reuse decision board | Considering owned clothes before another purchase | Wardrobe Reuse and Talk Me Out of It cover very similar decisions | 2 | 4 | 5 | 3 | 5 |
| Hair consultation brief | Communicating what should and should not change | Primary salon-interaction research supports the need; LookLock already combines a preview and stylist brief | 3 | 4 | 4 | 4 | 4 |
| Adaptive clothing finder | Finding usable styles and fastenings | InclusiFit exists; seated-pose support conflicts with current YouCam clothing capture guidance | 3 | 5 | 2 | 3 | 3 |
| **Occasionwear borrowing** | Finding an available piece, considering its appearance and arranging a clear handoff | Rental research identifies availability, process effort and trust barriers; existing rental services prove demand, so this is not a claim to invent rental | **4** | **4** | **4** | **4** | **5** |

## Selected audience and advantage

Borrowloom is for a small invitation-only wardrobe shared among people who already know each other: occasionwear circles, community collections and small lending groups. It connects **date availability → visual consideration → a request → owner approval → collection → return**. The virtual image does not reserve the garment. An approved loan and its care day do.

The competitive hypothesis is that putting appearance previews next to actual availability and the owner-controlled borrowing process reduces the steps between interest and a usable request. This hypothesis needs user testing. No avoided purchases, reduced returns, money saved or carbon benefit is claimed.

The scope excludes payments, deposits, shipping, automated eligibility decisions, body ratings and fit prediction. Membership is invitation-based. Photos are not a shared wardrobe asset; only the initiating user can retrieve their preview.

## Primary research

- [On the attractiveness of clothing libraries for women (2024), Utrecht University](https://research-portal.uu.nl/en/publications/on-the-attractiveness-of-clothing-libraries-for-women-investigati/): occasional clothing libraries were more attractive than everyday subscriptions in this study; barriers differed by consumption profile. This supports a focused occasionwear audience, not a universal market-size claim.
- [Drivers and barriers to fashion rental for everyday garments (2022)](https://www.tandfonline.com/doi/full/10.1080/15487733.2022.2065774): an empirical case study found price-performance, assortment and customer-acquisition difficulties; availability, liability and process effort matter. Rental is not automatically beneficial or easy to sustain.
- [Negative Requests Within Hair Salons (2022), original study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9377526/): reviewed for the alternative consultation concept; its observations do not establish this project's effectiveness.

## Competition searches

Bounded Devpost and GitHub searches reviewed wardrobe reuse, resale, rental, adaptive clothing, travel and salon workflows. Relevant examples: [Wardrobe Connect](https://devpost.com/software/wardrobe-connect-try-it-on), [Talk Me Out of It](https://devpost.com/software/talk-me-out-of-it), [LookLock](https://devpost.com/software/looklock-kda9my), [InclusiFit](https://devpost.com/software/inclusifit), and the [previous event gallery](https://youcam-api.devpost.com/project-gallery). Search absence is not proof that a similar product does not exist.

The [sponsor's account of prior winners](https://www.perfectcorp.com/business/news/YouCam-API-Hackthon-eCommerce) emphasizes focused consumer problems, coherent implementation and clear demonstrations. Borrowloom should be evaluated on its own evidence, rather than an assumed formula for winning.

## Technical references

- [YouCam clothing overview and image requirements](https://docs.perfectcorp.com/reference/ai_clothes)
- [Clothing v4 request and status contract](https://docs.perfectcorp.com/reference/ai_clothes/v4.0)
- [File registration](https://docs.perfectcorp.com/reference/file)
- [Feature cost and unit balance](https://docs.perfectcorp.com/reference/unit_system)
- [Task and input/output deletion](https://docs.perfectcorp.com/reference/task_management)
- [Official YouCam skills](https://github.com/YouCam-API/skills), reviewed as a protocol reference
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): the free tier includes database storage and daily read/write allowances. Never enable a paid plan as a deployment shortcut.

## Access observations

On this research date, the connected Supabase organization has two active projects on its free plan. They are unrelated and will not be repurposed. A dedicated D1 database and Worker avoid changing those projects. Vercel will serve the website and proxy its API to the Worker.

The cloud-browser Devpost form has Apparel VTO selected, but its remaining registration values are empty. The YouCam account flow displays a Terms-of-Use agreement before continuing. Neither registration nor API activation has been claimed complete.
