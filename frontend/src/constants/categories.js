import {
  Utensils,
  BedDouble,
  TrainFront,
  ShoppingBag,
  Camera,
  Receipt,
} from 'lucide-react';

export const EXPENSE_CATEGORIES = [
  {
    id: 'FOOD',
    label: '식비',
    icon: Utensils,
    bgClass: 'bg-[#EEF9DF]',
    textClass: 'text-[#477D27]',
    barColor: '#8ED64F',
  },
  {
    id: 'LODGING',
    label: '숙박',
    icon: BedDouble,
    bgClass: 'bg-[#E9F5FE]',
    textClass: 'text-[#2B6CB0]',
    barColor: '#63B3ED',
  },
  {
    id: 'TRANSPORT',
    label: '교통',
    icon: TrainFront,
    bgClass: 'bg-[#FFF5E6]',
    textClass: 'text-[#B76E1B]',
    barColor: '#F6AD55',
  },
  {
    id: 'SHOPPING',
    label: '쇼핑',
    icon: ShoppingBag,
    bgClass: 'bg-[#FBEFF7]',
    textClass: 'text-[#A33D7C]',
    barColor: '#ED64A6',
  },
  {
    id: 'SIGHTSEEING',
    label: '관광',
    icon: Camera,
    bgClass: 'bg-[#F0EEFD]',
    textClass: 'text-[#5A47B5]',
    barColor: '#9F7AEA',
  },
  {
    id: 'ETC',
    label: '기타',
    icon: Receipt,
    bgClass: 'bg-[#F2F5EE]',
    textClass: 'text-[#5E6D5B]',
    barColor: '#98A895',
  },
];

export function getCategoryMeta(categoryId) {
  return (
    EXPENSE_CATEGORIES.find((cat) => cat.id === categoryId) ||
    EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
  );
}
