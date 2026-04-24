/**
 * Breadcrumbs component.
 * Renders a horizontal breadcrumb trail based on the current route.
 * Uses FluentUI v9 Breadcrumb components for consistent styling.
 */

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useNavigate } from 'react-router';
import { useBreadcrumbs } from '../hooks/useBreadcrumbs';

const useStyles = makeStyles({
  root: {
    paddingBottom: tokens.spacingVerticalM,
  },
});

/**
 * Breadcrumb navigation trail.
 * Automatically builds from route `handle.breadcrumb` metadata.
 * The last item is rendered as current (non-clickable), all others are links.
 */
export function Breadcrumbs() {
  const styles = useStyles();
  const navigate = useNavigate();
  const breadcrumbs = useBreadcrumbs();

  // Don't render if there are no breadcrumbs or only one (current page)
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <div className={styles.root}>
      <Breadcrumb aria-label="Breadcrumb" size="medium">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <span key={crumb.path} style={{ display: 'contents' }}>
              {index > 0 && <BreadcrumbDivider />}
              <BreadcrumbItem>
                <BreadcrumbButton
                  current={isLast}
                  onClick={isLast ? undefined : () => navigate(crumb.path)}
                >
                  {crumb.label}
                </BreadcrumbButton>
              </BreadcrumbItem>
            </span>
          );
        })}
      </Breadcrumb>
    </div>
  );
}
