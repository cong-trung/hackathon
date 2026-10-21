import { memo } from 'react';
import PropTypes from 'prop-types';

import { Card, CardContent } from '@/shared/components/ui/card';

function PageWithDataTableLayout({
  isLoading = false,
  isError = false,
  errorMessage = 'Lỗi khi tải trang!',
  containerClassName = '',
  children,
}) {
  if (isLoading)
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]" />
    );

  if (isError) return <div>{errorMessage}</div>;

  return (
    <div
      className={`flex-1 flex-col justify-center items-center select-none h-full min-w-fit ${containerClassName}`}
    >
      <Card className="w-full h-full flex flex-col">
        <CardContent className="space-y-4 h-full flex flex-col pt-6">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

PageWithDataTableLayout.propTypes = {
  isLoading: PropTypes.bool,
  isError: PropTypes.bool,
  loadingMessage: PropTypes.string,
  errorMessage: PropTypes.string,
  containerClassName: PropTypes.string,
  children: PropTypes.node,
};

const MemoizedLayout = memo(PageWithDataTableLayout);

export default MemoizedLayout;
