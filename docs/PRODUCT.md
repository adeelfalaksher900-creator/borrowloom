# Borrowloom product requirements

## Product promise

Find a piece for your date. See a visual preview. Agree the handoff with its owner.

A wardrobe is a private, shared collection, not a public marketplace. Real users create their own collection and add their garments. An explicitly labelled example wardrobe is available for learning the workflow; its fictional garments are not offered for real-world borrowing.

## Core journeys

1. **Start a wardrobe:** choose a name, short description and a care-day buffer; create a private collection. Add garments with photo, category, size label, measurements, condition and care instructions. Copy an invitation for people you know.
2. **Join a wardrobe:** open its invitation and join with the display name from Your space. Browse garments, combine search/category/size filters, and enter collection and return dates. Availability comes from current server records.
3. **Consider a piece:** inspect details and measurements. Optionally upload a photo or choose the clearly labelled official YouCam example portrait. Confirm permission and YouCam processing. Start one asynchronous preview, observe status, compare the completed visual with its source, and delete the result or download its private image.
4. **Request dates:** send a note with the selected dates. A pending request does not block the calendar. Repeated submissions must not duplicate the request.
5. **Manage the handoff:** the owner approves or declines. Approval checks conflicts atomically, including care days. The owner records collection and actual return. Borrowers may cancel before collection. Changes have a retained event history.
6. **Keep control:** view your requests and memberships, save a recovery code for another browser, rotate a wardrobe invitation, revoke a member when no active loan prevents it, archive unused garments, and export your records. Recovering access must not expose another user's data.

## Acceptance criteria

| Area | Required observable behaviour |
| --- | --- |
| Availability | Two concurrent approvals cannot reserve one garment over overlapping dates; a care day blocks the next request correctly |
| State | Only authorized roles can perform defined transitions; archived garments cannot receive new requests |
| Ownership | An unrelated session cannot read a private wardrobe, retrieve a portrait/result, edit a garment or approve a request |
| Preview | No image is sent before explicit permission; no fake output, silent model fallback or repeated billable task is used |
| Recovery | A valid recovery code restores the same identity; invalid codes fail; generating a new code revokes the previous code |
| Images | Decode and normalize on the device; accept bounded JPEG/PNG inputs; remove metadata on normalization; validate bytes server-side |
| Network | Requests have deadlines, actionable errors and retry paths; uncertain task submission is not silently repeated |
| Persistence | Refresh preserves saved records; a second authorized browser can participate through the server |
| Accessibility | Semantic labels, visible keyboard focus, logical tab order, Escape/dialog handling, reduced motion, no horizontal overflow at 390 px |
| Delivery | Public HTTPS site, working navigation, deployment-independent verification, source/setup/tests/license, saved Devpost text draft |

## Product boundaries

A generative preview estimates appearance. It cannot establish physical fit, true fabric behaviour, garment condition, hygiene, availability or safety. The catalogue measurements and the owner remain the source for physical details. Do not infer age, gender, ethnicity, health, disability or attractiveness from an image. Do not score bodies.

No payment is collected and no fake booking or merchant partnership is represented. A record of a borrowing request is not evidence that a real-world handoff occurred. A collection owner can manage only their own wardrobe; invitations grant member access, not owner permissions.

## Success evidence

During development, measure task correctness, concurrency behaviour, isolation, validation, API latency/cost on authorized samples and completion of the two-role journey. Plan a later consenting-user study of finding an available piece, making a request and understanding preview limits. Do not substitute synthetic test results for field outcomes.

## Phase boundaries

Finish the product, tests, deployment, repository and Devpost text first. The final video, fifteen-image gallery and final submission require the user's later approval. No enrolled-student or teammate role is invented.
