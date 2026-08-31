import RoboticArmDark from '@/shared/assets/images/robotic-arm-dark.svg';
import RoboticArmLight from '@/shared/assets/images/robotic-arm-light.svg';

import { useContrastIcon } from '@/shared/hooks/useContrastIcon';

const RoboticArmIcon = ({
  className = '',
  theme: themeProp,
  isActive,
  ...props
}) => {
  const roboticArmSrc = useContrastIcon({
    isActive,
    theme: themeProp,
    lightIcon: RoboticArmLight,
    darkIcon: RoboticArmDark,
  });
  const activeClass = isActive ? 'ring-2 ring-primary' : '';
  return (
    <img
      src={roboticArmSrc}
      alt="Robotic Arm"
      className={`w-4 h-4 bg-white ${activeClass} ${className}`}
      {...props}
    />
  );
};

export default RoboticArmIcon;
