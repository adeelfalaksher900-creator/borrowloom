# Borrowloom design direction

## Product character

An invitation to a good wardrobe: calm editorial photography, a deep berry accent, near-white surfaces, readable dark text and restrained chrome. Use generous spacing and a high-contrast serif headline with a native system sans for controls. Avoid gradients, glowing AI ornaments, oversized glass panels and invented metrics. Borrowloom should resemble an actual fashion service with an understandable next action.

## References inspected through Mobbin

- [ZARA product view](https://mobbin.com/screens/b5ef602f-13cb-4dfb-8813-d7e4258a06ef): the garment dominates the page; metadata is secondary and the composition has room to breathe.
- [Selfridges item-detail form](https://mobbin.com/screens/deb3c52c-d189-454f-9dba-e06a130c2391): concrete condition and included-parts inputs, selected chips and a clear next step.
- [Tripadvisor reservation selection](https://mobbin.com/screens/21632a98-8496-4d51-842f-103cd064d9c4): the date, available option and total commitment are adjacent. Reuse this clarity for borrowing dates, without presenting a payment flow.
- [Zomato reservation screen](https://mobbin.com/screens/4e8c570a-810c-4633-a74d-9a90de18bf60): constrained choices and a bottom continuation control keep a mobile reservation understandable.

These are design references, not licensed assets or screenshots to embed in Borrowloom. Copy no brand logo, protected photograph or entire product design.

## Screens

- Home: nav, editorial hero, real explanations, wardrobe entry actions, privacy summary, FAQ and full footer.
- My wardrobes: memberships, owned collections, join/create flows and a useful empty state.
- Wardrobe: dates and availability first, search/filter controls, garment gallery, details and owner controls.
- Fitting room: selected garment, explicit image/processing permission, capture guidance, real asynchronous state, completed comparison and request CTA.
- Borrowing: separate incoming and personal requests, a clear status trail and authorized next actions.
- Guide: owner/borrower instructions, photo requirements, care-day explanation and preview limitations.
- Settings: display name, recovery, export, photo deletion and membership controls.
- Privacy: specific data, recipients, expiry, deletion and operating limits.

## Interaction requirements

44px touch targets; explicit labels; visible focus; no placeholder-only forms; form errors associated with the field; a live status region; real disabled/busy states. Dialogs trap focus and close with Escape. Preserve entered values after recoverable errors. The return date is inclusive and a care day is visibly blocked. A pending request never looks confirmed. Avoid animation that delays core tasks; reduced-motion users receive the same content immediately.

## Skills applied

Minimalist UI and high-end visual-design guidance inform hierarchy, spacing, typography and restrained motion. Their conflicting styling prescriptions are resolved in favour of this product's accessible editorial system. Anatomy is relevant only for an explanatory mechanism, rather than the main commerce UI. REA explicitly directs ordinary source projects to normal repository analysis; no binary reverse engineering is needed. The macOS menubar skill does not apply to a browser application and is not used to introduce a separate native product.
