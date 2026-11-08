# Requirements Document

## Introduction

This feature reworks the repository from a Meetup/LinkedIn automation tool into a lightweight toolkit for managing Calls for Papers (CFPs) and speakers, and matching speakers to events. It is a lighter-weight alternative to Sessionize, built for a single organising group with several organisers.

There are two kinds of user: **Admins** (organisers) and **Speakers**. Admins manage an internal event calendar, a speaker directory with a private "have back" / "not again" marker, and CFPs with admin-defined questions. Speakers maintain a profile, answer CFPs, and track their submissions.

All Meetup and LinkedIn integration, social scheduling, messaging, and notification features are removed.

### Scope

- In scope: internal events calendar, speaker profiles, speaker marker, CFP builder with custom questions, CFP submissions and review, speaker-to-event matching, role-based login, removal of legacy code, a single-place product name setting.
- Out of scope: multi-tenancy (one organising group only), integration with Meetup, LinkedIn or any external calendar, payments, public (unauthenticated) CFP pages, email campaigns.

### Glossary

- **Toolkit**: The application described by this document.
- **Admin**: An authenticated organiser with the `admin` role.
- **Speaker**: An authenticated user with the `speaker` role.
- **Event**: An entry in the internal event calendar.
- **Speaker_Profile**: The public-to-admins profile a Speaker maintains.
- **Marker**: An admin-only flag on a Speaker that is either `have_back` or `not_again`, or unset.
- **CFP**: A Call for Papers. A CFP is not tied to any Event; speakers can be booked onto any Event from any CFP.
- **Standing_CFP**: A CFP with no close date. It stays open until an Admin closes it, and the organiser can draw speakers from it for more than one Event.
- **CFP_Question**: A question defined by an Admin that Speakers answer when submitting to a CFP.
- **Submission**: A Speaker's answers and talk details for a CFP.
- **Booking**: The assignment of an accepted Submission (or a Speaker directly) to an Event.
- **App_Name**: The product name displayed in the UI, defined in one configuration location.

## Requirements

### Requirement 1: Role-based authentication

**User Story:** As a user, I want to sign in with an account that has a role, so that I only see the tools relevant to me.

#### Acceptance Criteria

1. THE Toolkit SHALL support exactly two roles: `admin` and `speaker`.
2. WHEN a new user signs up through the public sign-up form, THE Toolkit SHALL assign the `speaker` role.
3. THE Toolkit SHALL NOT allow the `admin` role to be assigned through public sign-up.
4. WHEN an Admin promotes an existing user to Admin, THE Toolkit SHALL assign the `admin` role to that user.
5. WHEN an Admin invites an email address as Admin, THE Toolkit SHALL create an account that holds the `admin` role.
6. WHEN a user signs in, THE Toolkit SHALL route an Admin to the admin area and a Speaker to the speaker area.
7. IF a Speaker requests an admin-area page or API route, THEN THE Toolkit SHALL deny access and return a 403 response for API calls.
8. IF an unauthenticated request is made to a protected API route, THEN THE Toolkit SHALL return a 401 response.
9. THE Toolkit SHALL determine a user's role on the server from the verified token, and SHALL NOT trust a role supplied by the client.
10. WHERE a user holds both the `admin` and `speaker` roles, THE Toolkit SHALL open the admin area by default, SHALL allow that user to switch between the admin area and the speaker area, and SHALL show which area they are viewing. A user without the `speaker` role SHALL NOT be able to open the speaker area, and a user without the `admin` role SHALL NOT be able to open the admin area.

### Requirement 2: Internal event calendar

**User Story:** As an Admin, I want an internal calendar of events, so that I can plan which events need speakers.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to create an Event with a title, date and start time, end time, venue or online location, description, format, and status.
2. THE Toolkit SHALL support the Event statuses `draft`, `scheduled`, `completed`, and `cancelled`.
3. THE Toolkit SHALL allow an Admin to edit and delete an Event.
4. THE Toolkit SHALL display Events in a calendar view and in a list view.
5. THE Toolkit SHALL allow an Admin to filter the list view by status and by date range.
6. IF an Admin attempts to save an Event without a title or date, THEN THE Toolkit SHALL reject the save and identify the missing fields.
7. IF an Admin attempts to save an Event whose end time is before its start time, THEN THE Toolkit SHALL reject the save and show a validation message.
8. WHEN an Admin deletes an Event that has Bookings, THE Toolkit SHALL ask for confirmation before deleting.
9. WHEN an Event is deleted, THE Toolkit SHALL remove its Bookings. THE Toolkit SHALL NOT change any CFP, because CFPs are not linked to Events.

### Requirement 3: Speaker profiles

**User Story:** As a Speaker, I want to maintain a profile, so that organisers can learn about me and consider me for events.

#### Acceptance Criteria

1. THE Toolkit SHALL allow a Speaker to create and edit their own Speaker_Profile containing name, bio, headshot image, location, topics, social and website links, and a list of past talks.
2. WHEN a Speaker first signs in and has no Speaker_Profile, THE Toolkit SHALL prompt them to create one.
3. THE Toolkit SHALL allow a Speaker to view and edit only their own Speaker_Profile.
4. IF a Speaker saves a profile without a name or bio, THEN THE Toolkit SHALL reject the save and identify the missing fields.
5. IF a headshot upload is larger than 5 MB or is not a JPEG, PNG, or WebP image, THEN THE Toolkit SHALL reject the upload and show a message.
6. THE Toolkit SHALL allow an Admin to view every Speaker_Profile.
7. THE Toolkit SHALL allow an Admin to create a Speaker_Profile on behalf of a person who has no account, and SHALL allow that profile to be linked to an account later.
8. THE Toolkit SHALL allow an Admin to edit any Speaker_Profile.

### Requirement 4: Speaker directory and search

**User Story:** As an Admin, I want to search and filter speakers, so that I can quickly find suitable people for an event.

#### Acceptance Criteria

1. THE Toolkit SHALL display Admins a speaker directory listing all Speaker_Profiles.
2. THE Toolkit SHALL allow an Admin to search the directory by name and free text.
3. THE Toolkit SHALL allow an Admin to filter the directory by topic, location, and Marker.
4. WHEN an Admin opens a Speaker in the directory, THE Toolkit SHALL show the full profile, the Marker, admin notes, and the Speaker's Submissions and Bookings history.

### Requirement 5: Have back / not again marker

**User Story:** As an Admin, I want to mark speakers as "have back" or "not again", so that the team remembers who to invite again and who to avoid.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to set a Speaker's Marker to `have_back`, `not_again`, or unset.
2. THE Toolkit SHALL allow an Admin to record a private note alongside the Marker.
3. WHEN an Admin changes a Marker, THE Toolkit SHALL record which Admin made the change and when.
4. THE Toolkit SHALL NOT include the Marker, the Marker note, or the admin notes in any response to a Speaker.
5. WHERE the Marker is `not_again`, THE Toolkit SHALL display a visible warning when an Admin attempts to create a Booking for that Speaker.
6. WHERE the Marker is `not_again`, THE Toolkit SHALL display a visible indicator on that Speaker's Submissions in the review screen.
7. WHERE the Marker is `not_again`, THE Toolkit SHALL still allow an Admin to proceed with a Booking after confirmation.
8. WHERE the Marker is `have_back`, THE Toolkit SHALL display a visible indicator on that Speaker's directory entry and Submissions.

### Requirement 6: CFP management

**User Story:** As an Admin, I want to create and run CFPs, so that I can collect talk proposals for our events.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to create a CFP with a title, description, an optional open date, an optional close date, and status.
2. THE Toolkit SHALL support the CFP statuses `draft`, `open`, and `closed`.
3. THE Toolkit SHALL allow an Admin to edit, close, reopen, and delete a CFP.
4. IF an Admin sets both an open date and a close date and the close date is not after the open date, THEN THE Toolkit SHALL reject the save and show a validation message. A missing open date or close date is not an error.
5. WHEN a CFP has a close date and that close date has passed, THE Toolkit SHALL treat the CFP as closed for new Submissions.
6. THE Toolkit SHALL NOT link a CFP to an Event. A CFP SHALL have no event selector, and any `eventId` stored on an older CFP SHALL be ignored.
7. WHEN an Admin deletes a CFP that has Submissions, THE Toolkit SHALL ask for confirmation before deleting.
8. THE Toolkit SHALL allow an Admin to duplicate a CFP, including its questions, to use as the basis for a new CFP.
9. WHERE a CFP has no close date (a Standing_CFP), THE Toolkit SHALL treat it as open for new Submissions while its stored status is `open` and its open date, if any, has passed, until an Admin closes it.
10. THE Toolkit SHALL allow an Admin to close and reopen a Standing_CFP, to duplicate it, and to clear the close date of an existing CFP to make it standing.
11. THE Toolkit SHALL list a Standing_CFP among the open CFPs, and SHALL show Speakers `Open until further notice` instead of a close date.

### Requirement 7: CFP question builder

**User Story:** As an Admin, I want to define the questions on each CFP in the GUI, so that I can collect exactly the information I need without a developer.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to add, edit, reorder, and delete CFP_Questions on a CFP.
2. THE Toolkit SHALL support the CFP_Question types `short_text`, `long_text`, `single_select`, `multi_select`, `yes_no`, and `number`.
3. WHERE a CFP_Question type is `single_select` or `multi_select`, THE Toolkit SHALL require at least two options.
4. THE Toolkit SHALL allow an Admin to mark each CFP_Question as required or optional.
5. THE Toolkit SHALL allow an Admin to add help text to each CFP_Question.
6. THE Toolkit SHALL allow an Admin to save a set of CFP_Questions as a reusable template and to apply a template to a CFP.
7. WHEN an Admin applies a template to a CFP, THE Toolkit SHALL copy the questions so that later edits to the template do not alter existing CFPs.
8. WHEN a CFP has at least one Submission, THE Toolkit SHALL warn an Admin before they delete a CFP_Question or change its type.
9. WHEN an Admin deletes a CFP_Question that has recorded answers, THE Toolkit SHALL retain the existing answers on those Submissions so they remain readable by Admins.
10. THE Toolkit SHALL include a fixed set of core fields on every Submission (talk title, abstract, and talk duration) in addition to the custom CFP_Questions.

### Requirement 8: Speaker CFP submission

**User Story:** As a Speaker, I want to browse open CFPs and submit talks, so that I can be considered for events.

#### Acceptance Criteria

1. THE Toolkit SHALL show a Speaker the list of CFPs whose status is `open`, whose open date (if any) has passed, and whose close date (if any) has not passed.
2. THE Toolkit SHALL NOT show a Speaker CFPs with the status `draft`.
3. WHEN a Speaker opens a CFP, THE Toolkit SHALL display the core fields and the CFP_Questions in the order set by the Admin.
4. THE Toolkit SHALL require a Speaker to have a Speaker_Profile before submitting.
5. IF a required field or required CFP_Question is not answered, THEN THE Toolkit SHALL reject the Submission and identify the unanswered items.
6. IF a Speaker answers a select question with a value that is not one of its options, THEN THE Toolkit SHALL reject the Submission.
7. IF a Speaker attempts to submit to a CFP that is closed, THEN THE Toolkit SHALL reject the Submission and show a message.
8. THE Toolkit SHALL allow a Speaker to save a Submission as a draft and to return to it later.
9. THE Toolkit SHALL allow a Speaker to submit more than one talk to the same CFP.
10. THE Toolkit SHALL allow a Speaker to edit or withdraw a Submission until the CFP close date, or, for a Standing_CFP, until an Admin closes it.
11. THE Toolkit SHALL allow a Speaker to view only their own Submissions and their statuses.
12. THE Toolkit SHALL show a Speaker only a simplified status of their Submission, and SHALL NOT show Marker information, admin notes, or review notes.

### Requirement 9: Submission review

**User Story:** As an Admin, I want to review submissions, so that I can decide which talks to accept.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to list all Submissions for a CFP, filtered by status and sorted by submission date.
2. THE Toolkit SHALL support the Submission statuses `draft`, `submitted`, `shortlisted`, `accepted`, `rejected`, and `withdrawn`.
3. THE Toolkit SHALL allow an Admin to change a Submission's status.
4. THE Toolkit SHALL allow an Admin to add private review notes and a rating from 1 to 5 to a Submission.
5. WHEN an Admin opens a Submission, THE Toolkit SHALL display the Speaker's profile summary, the Marker, and all answers.
6. THE Toolkit SHALL NOT include `draft` Submissions in the default Admin review list.
7. WHEN multiple Admins rate the same Submission, THE Toolkit SHALL store each Admin's rating separately and show the average.

### Requirement 10: Matching speakers to events

**User Story:** As an Admin, I want to assign speakers and talks to events, so that I can build the lineup for each event.

#### Acceptance Criteria

1. THE Toolkit SHALL allow an Admin to create a Booking linking a Speaker to an Event, optionally referencing an accepted Submission.
2. THE Toolkit SHALL support the Booking statuses `proposed`, `confirmed`, and `declined`.
3. WHEN an Admin opens an Event, THE Toolkit SHALL display its Bookings and the accepted Submissions from all CFPs, labelled by CFP title, each with a Book action.
4. WHEN an Admin accepts a Submission, THE Toolkit SHALL offer to book the Speaker onto an Event chosen from the upcoming, non-cancelled Events, and SHALL show any booking warnings before the Booking is created.
5. IF an Admin attempts to create a Booking for a Speaker who already has a Booking on the same Event, THEN THE Toolkit SHALL warn the Admin.
6. IF an Admin attempts to book a Speaker onto two Events that overlap in time, THEN THE Toolkit SHALL warn the Admin and still allow the Booking after confirmation.
7. THE Toolkit SHALL allow an Admin to view, for any Speaker, their full Booking history.
8. THE Toolkit SHALL allow a Speaker to see their own `confirmed` Bookings and the Event details for them.
9. THE Toolkit SHALL NOT show a Speaker Bookings with the status `proposed` or `declined`.
10. THE Toolkit SHALL allow the same Submission to be booked onto several Events, and SHALL NOT require the Submission's CFP to match the Event.

### Requirement 11: Data integrity and access control

**User Story:** As an organiser, I want my data protected and consistent, so that speaker details are private and records stay accurate.

#### Acceptance Criteria

1. THE Toolkit SHALL enforce role and ownership checks on the server for every API route.
2. THE Toolkit SHALL reject any request that attempts to read or modify another Speaker's profile, Submissions, or Bookings when made by a Speaker.
3. THE Toolkit SHALL validate all input on the server, independent of client-side validation.
4. THE Toolkit SHALL store headshot images in private storage and serve them through time-limited signed URLs.
5. WHEN a Speaker deletes their account, THE Toolkit SHALL delete their Speaker_Profile, Submissions, and headshot, and SHALL retain anonymised Booking records for Event history.
6. THE Toolkit SHALL record the creating and last-modifying user and timestamps on Events, CFPs, Submissions, and Bookings.

### Requirement 12: Configurable product name

**User Story:** As the owner, I want to change the product name in one place, so that renaming it later is trivial.

#### Acceptance Criteria

1. THE Toolkit SHALL define the App_Name in a single frontend configuration location.
2. THE Toolkit SHALL read the App_Name from that location for the page title, navigation header, sign-in pages, and any other UI text that displays the product name.
3. THE Toolkit SHALL use a placeholder App_Name until the owner chooses a final name.
4. WHEN the App_Name value is changed in that location and the frontend is rebuilt, THE Toolkit SHALL display the new name everywhere in the UI without any other code change.

### Requirement 13: Removal of legacy functionality

**User Story:** As the maintainer, I want the dead Meetup and LinkedIn code removed, so that the codebase only contains what is used.

#### Acceptance Criteria

1. THE Toolkit SHALL NOT include the LinkedIn authentication, LinkedIn callback, social media scheduler, messaging center, or notification center features.
2. THE Toolkit SHALL NOT include backend handlers, tables, queues, or configuration parameters that relate to Meetup or LinkedIn, event synchronisation, scheduled posts, messages, or notifications.
3. THE Toolkit SHALL NOT retain tests that exercise removed functionality.
4. WHEN the legacy code is removed, THE Toolkit SHALL still build, lint, and pass its remaining tests.
5. THE Toolkit SHALL update the README and deployment documentation to describe the CFP and speaker toolkit.
