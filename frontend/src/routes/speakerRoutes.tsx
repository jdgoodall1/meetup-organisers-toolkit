import { Navigate, type RouteObject } from 'react-router-dom';
import MySubmissions from '../components/speaker/MySubmissions';
import MyBookings from '../components/speaker/MyBookings';
import ProfileForm from '../components/speaker/ProfileForm';
import DeleteAccount from '../components/speaker/DeleteAccount';
import OpenCfps from '../components/speaker/OpenCfps';
import CfpDetail from '../components/speaker/CfpDetail';
import { EditSubmissionPage, NewSubmissionPage } from '../components/speaker/SubmissionPages';

/**
 * Child routes of `/speaker`; paths match the speaker nav in `Layout`.
 */
export const speakerRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="profile" replace /> },
  { path: 'profile', element: (
      <>
        <ProfileForm />
        <DeleteAccount />
      </>
    ) },
  { path: 'cfps', element: <OpenCfps /> },
  { path: 'cfps/:id', element: <CfpDetail /> },
  { path: 'cfps/:id/submit', element: <NewSubmissionPage /> },
  { path: 'submissions/:id/edit', element: <EditSubmissionPage /> },
  { path: 'submissions', element: <MySubmissions /> },
  { path: 'bookings', element: <MyBookings /> },
  { path: '*', element: <Navigate to="/speaker" replace /> },
];

