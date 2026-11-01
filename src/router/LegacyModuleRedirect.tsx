import { Navigate, useLocation } from 'react-router-dom';
import type { ItemType } from '@memex/core';
import { LIBRARY_PATH, TYPE_PARAM } from '../constants/modules';

interface LegacyModuleRedirectProps {
  /** Type filter to preselect in the Library (omit to land on the unfiltered stream). */
  type?: ItemType;
}

/**
 * Old routes (/home, /links, /notes, /tasks) land in the Library, with the
 * type preselected for the per-primitive ones. Existing query params (a
 * `?note=<id>` or `?link=<id>` deep link) are carried along.
 */
const LegacyModuleRedirect = ({ type }: LegacyModuleRedirectProps) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (type) {
    params.set(TYPE_PARAM, type);
  }
  const search = params.toString();
  return <Navigate to={`${LIBRARY_PATH}${search ? `?${search}` : ''}`} replace />;
};

export default LegacyModuleRedirect;
