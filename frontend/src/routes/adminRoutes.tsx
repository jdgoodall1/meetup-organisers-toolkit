import { Navigate, type RouteObject } from 'react-router-dom';
import AdminBookings from '../components/admin/AdminBookings';
import EventsPage from '../components/admin/EventsPage';
import EventEditPage from '../components/admin/EventEditPage';
import SpeakerDirectory from '../components/admin/SpeakerDirectory';
import SpeakerDetail from '../components/admin/SpeakerDetail';
import SpeakerCreatePage from '../components/admin/SpeakerCreatePage';
import CfpList from '../components/admin/CfpList';
import CfpEditPage from '../components/admin/CfpEditPage';
import SubmissionList from '../components/admin/SubmissionList';
import SubmissionReview from '../components/admin/SubmissionReview';
import UserAdmin from '../components/admin/UserAdmin';

/**
 * Child routes of `/admin`; paths match the admin nav in `Layout`.
 * `bookings` is a read-only overview; bookings are edited from the event page (`events/:id`).
 */
export const adminRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="events" replace /> },
  { path: 'events', element: <EventsPage /> },
  { path: 'events/new', element: <EventEditPage /> },
  { path: 'events/:id', element: <EventEditPage /> },
  { path: 'speakers', element: <SpeakerDirectory /> },
  { path: 'speakers/new', element: <SpeakerCreatePage /> },
  { path: 'speakers/:id', element: <SpeakerDetail /> },
  { path: 'cfps', element: <CfpList /> },
  { path: 'cfps/new', element: <CfpEditPage /> },
  { path: 'cfps/:id', element: <CfpEditPage /> },
  { path: 'cfps/:id/submissions', element: <SubmissionList /> },
  { path: 'submissions/:id', element: <SubmissionReview /> },
  { path: 'bookings', element: <AdminBookings /> },
  { path: 'users', element: <UserAdmin /> },
  { path: '*', element: <Navigate to="/admin" replace /> },
];

