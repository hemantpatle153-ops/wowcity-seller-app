# Google Play release kit

Everything needed to publish this app in Play Console. Built from `main` with the live server; demo data is off.

- `*.aab`: the release bundle. Upload it in Play Console → Test and release → (track) → Create new release.
- `icon-512.png` and `feature-graphic-1024x500.png`: store graphics.
- `screenshots/`: phone screenshots (1080×1920), in order.
- `listing.md`: store text, plus answers for Data safety, Content rating, Target audience and App access.

The bundle is signed with an **upload key** that is kept outside this repository. Turn on Play App Signing (the default) when you upload.
