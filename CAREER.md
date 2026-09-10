# APEX / 26 career

The home screen is now a minimal starting point for a complete redesign. Its former hero imagery, marketing copy, cards and injected navigation have been removed; `home-menu.css` owns the replacement entry screen. Career, race, garage, replay and controller actions remain connected. Existing career screens and saves are retained. Track geometry, car models, shaders and race-start presentation are preserved. Career upgrades still use the game's existing top-speed and grip modifiers.

The ideas and preservation requirements are recorded in [GitHub issues #5–#13](https://github.com/wellsdj/3D-F1-SIM/issues?q=is%3Aissue+is%3Aopen). Artwork files remain available for reuse. The separate in-progress AI rewrite is preserved, but its first-corner and full-grid behaviour still needs validation in [#10](https://github.com/wellsdj/3D-F1-SIM/issues/10).

## Play

Choose **Start career** (or **Continue career**), select one of three slots, enter a driver/team/number, pick a four- or eight-weekend season and AI difficulty, and sign an Academy contract. Use the existing garage to finish the car and choose Next.

Each weekend follows briefing → practice → simulated qualifying → race → debrief. Practice uses the existing valid-lap timer and gates. A valid lap returns to the hub. The first valid practice lap awards 250 development credits and 50 upgrade points. Careers start with 500 upgrade points; stronger race finishes earn more. The development shop spends upgrade points, with both balances displayed above the career pages. Finishing practice automatically simulates qualifying from car development, opponent difficulty and a random performance variation for each driver. The grid is saved once per weekend; restarting cannot redraw it. A race uses the existing three-lap, ten-car simulation.

Difficulty now has five levels, corresponding to the former 5, 7, 8, 9 and 10. Choose it at career setup; it is fixed for that career. Existing saves migrate to the nearest supported level without changing their progress. Career session weather is fixed by the calendar, with no weather-choice buttons. Replays initialise their trackside cameras even when opened directly from the home screen and start in TV mode; C still cycles views.

The in-progress AI changes use a later braking envelope and lateral overtaking choices without traffic-driven pedal reductions. These changes are not yet verified as an improvement; first-corner braking, gravel avoidance, exit speed and full-grid interactions need testing before calling the tuning complete.

Race classification waits for rivals to finish, up to 90 simulation seconds after the player's finish. Remaining rivals are DNF. Penalties affect classification. Disqualified/non-finishing entries receive no championship points. Rewards and points are applied once; Continue season advances the round. The next contract keeps the car, credits and career history, resets championship points, and records the previous season.

Track limits are always relaxed; the setting is no longer adjustable. Disqualification hands steering and pedals to an AI retirement driver, which follows a forward racing-line route into reachable gravel and parks. If no clear gravel route exists, it brakes safely in place. Once stopped, restart the race or continue with a simulated remaining classification. Race rewards use an animated credits/upgrade-points panel.

Calendar, standings, development, and career record are available from the hub. Career records now retain each completed practice, qualifying and race lap, plus deleted qualifying attempts and disqualification laps, across seasons. Laps driven before this update cannot be reconstructed. Contracts unlock at 25 and 55 recognition. Their top-five/top-three objectives pay larger bonuses. Livery choices are stored per career. Saves use localStorage on the current browser/origin; they are not cloud saves. Leaving an unfinished session allows a retry; a reload restarts that session from the hub rather than restoring a car mid-lap.

## Adaptation limits

This is an F1-style career adapted to the material in this project, not an exact recreation of EA's commercial game. It uses Spa for every weekend, nine fictional rival teams and one entry per team. It does not invent other circuits, a second teammate, licensed teams, F2, a transfer market, or the 2026 power-unit regulations. Contract progression is the game's own system.

Reference: EA's [2026 career overview](https://www.ea.com/en/games/f1/f1-25/features/career-mode) and [2026 Season Pack tips](https://www.ea.com/games/f1/f1-25/news/f1-25-2026-season-pack-tips-and-tricks).

## Verify

`node --test tests/*.test.cjs`

Serve the directory with `python3 -m http.server` and open localhost. Browser checks cover menu navigation, driver setup, save/resume, garage return, practice loading and exit, qualifying progression, and race-grid placement. The automated suite exercises complete season rollover and result scoring, including penalty-adjusted order and DNF timeout. A full manually driven championship is not part of the automated check.

## AI artwork

Both assets were generated with the built-in image generation tool and copied into the repository.

- `assets/career/pitlane-hero.png`: "Use case: ads-marketing. Asset type: premium racing simulator home screen background photograph, landscape 16:9. Cinematic photorealistic motorsport editorial image of a modern unbranded open-wheel formula race car in deep graphite with restrained warm orange accents, parked at the Spa pit lane at blue hour, wet reflective asphalt, fine mist, dramatic white garage strip lights, distant wooded Ardennes hills. Car fully visible on RIGHT TWO THIRDS in low front three-quarter view, beautiful realistic carbon fibre, tires and suspension. Left third dark and uncluttered for interface copy. Professional premium racing game campaign photography, controlled highlights, crisp car, subtle film grain. No text, no lettering, no logos, no watermark. Image only, no UI."
- `assets/career/driver-garage.png`: "Use case: ads-marketing. Asset type: landscape 16:9 premium racing game career dashboard photographic background. Photorealistic editorial motorsport photo of a helmeted race driver in graphite racing suit with subtle orange details, seen from behind standing on the RIGHT side of the image at a pit garage opening, looking toward Spa-Francorchamps forest and track in soft dawn light. Unbranded open wheel car slightly out of focus in garage. Elegant cinematic natural light, deep charcoal shadows, calm anticipation, beautiful high-end photography. Left half dark garage negative space for interface. No text, no logos, no watermark, no interface."
