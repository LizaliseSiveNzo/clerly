# Archived black soaps

The African Black Soap Bar and Liquid African Black Soap were removed from the active storefront on 20 October 2026. Their complete catalogue entries, product/variant IDs, bundle prices, image paths, directions and descriptions are saved in `black-soaps-2026-10-20.json`.

Their existing Supabase rows are retained, unpublished/demo with zero stock. Historical orders are unchanged. Referenced image assets remain in `public/` so they can be reused; no assets or products were deleted from the database.

To restore after the owner approves a relaunch:
1. Merge the archived `products` entries back into `src/preorder-catalog.json` without changing product or variant IDs.
2. Review current prices, formulation, images, dispatch terms and supplier availability. Do not assume archived claims or prices are still current.
3. If selling again, publish the matching database products, clear demo mode and set approved variant allocations. Keep the shared batch capacity in mind.
4. Update homepage/about/footer copy as appropriate, build, and deploy. The product routes and cards are generated from the active catalogue.

The current live collection contains the 5% Niacinamide Serum and Turmeric Cleansing Bar only.
