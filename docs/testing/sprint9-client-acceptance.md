# Client acceptance agenda and decision record (TFH-675)

**Status: accepted by Tim (TFH Technology Director) and Pastor Michael, recorded 2026-11-13.**

Coordinator: Jack. Client reviewers: Tim and Pastor Michael. Use this during the
actual acceptance meeting after TFH-640 and the required regression fixes pass.
It complements the [admin guide](../admin-guide.md) prepared for review under
TFH-674; record actual delivery during the handoff.

## Meeting and release

| Item | Record during the meeting |
| --- | --- |
| Date/time and timezone | Recorded 2026-11-13 (Pacific), after the 2026-11-11 go-live session with Tim |
| Attendees | Tim and Pastor Michael (client), Samip |
| Environment / approved URL | Production, https://hub.tfh.org |
| Deployed commit / release | `bcbfc66`, release `bcbfc66-tfh540-20261113T223729Z` |
| Recovery and production verification evidence | [Go-live record](../production-launch.md#production-go-live-record-2026-11-11) and [November 8 operations](sprint9-operations-20261108.md) |
| Admin guide version and delivery | Prepared in [admin-guide.md](../admin-guide.md); delivery not recorded here |
| Approved sample sermon/video | Not recorded |

Use an agreed small sample for imports and edits. Record results against the
deployed revision rather than demonstrating a local branch and calling it
production acceptance.

## Demo and acceptance steps

| Step | Expected behavior | Actual result / evidence |
| --- | --- | --- |
| 1. Production sign-in and roles | Admin can manage content; staff can read; an unassigned account is denied. Logout/account switching protects saved data. | Passed: the team tested the Admin, Internal User and unassigned test accounts on hub.tfh.org (TFH-654). |
| 2. Import one approved video | The import reports its status, reaches the expected terminal state, and Open sermon opens the saved record. A duplicate import identifies the existing sermon. | Covered in Tim's review; no defects reported. |
| 3. Transcript and playback | The transcript belongs to the video; selecting a timed passage seeks to the right moment. The larger player works at the client's screen size. | Covered in Tim's review; no defects reported. |
| 4. Search | An agreed query retrieves relevant published sermons, with correct dates/filters and links. | Covered in Tim's review; no defects reported. |
| 5. Grounded AI chat | A supported question answers with relevant citations whose links open the right timestamp; an unsupported question is declined. | Passed on production 2026-11-13: sermon and general questions answered with working timestamp links, follow-ups stayed on topic, an off-topic question was declined. |
| 6. Edit and reload | Title, speaker, series, date, description and supported tag changes persist after reload. Manual summaries retain their intended provenance. | Covered in Tim's review; no defects reported. |
| 7. Delete safety | Delete is separated from Upload/Edit and requires confirmation. Demonstrate cancel first; use an approved disposable record for an actual deletion. | Covered in Tim's review; no defects reported. |
| 8. Recovery and maintenance handoff | Show the completed backup/restore/reboot evidence, where token renewal is documented, the admin guide and the operational owners. | Evidence linked above. |
| 9. AI disclosure | Review how AI-generated content is labeled, the limits of generated answers and when an admin reviews/corrects content. | Covered in Tim's review; no defects reported. |

Record defects with the expected/actual result, severity, owner and Jira key once
the team files them. Repeat the affected acceptance steps after a fix; acceptance
of an older revision does not verify a later change.

## Decisions

| Reviewer | Decision (accept / conditional / decline) | Date and evidence | Conditions / required fixes |
| --- | --- | --- | --- |
| Tim | Accept | Approved after the go-live and demo; recorded 2026-11-13 | None |
| Pastor Michael | Accept | Approved; recorded 2026-11-13 | None |

Jack records what each reviewer actually decided. Leave the decision pending
until the reviewer approves it. Link the completed record from the client
meeting notes and TFH-675 after review; do not infer approval from attendance,
a green test suite or a working demo.
