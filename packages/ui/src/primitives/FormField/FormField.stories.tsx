// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { Input } from '../Input';
import { FormField } from './FormField';

const meta = {
  title: 'Primitives/FormField',
  component: FormField,
};
export default meta;

const control = <Input placeholder="입력하세요" />;

export const Basic = { args: { label: '이름', children: control } };
export const WithDescription = {
  args: { label: '이름', description: '다른 사람에게 보이는 이름', children: control },
};
export const Required = { args: { label: '이름', required: true, children: control } };
export const WithError = {
  args: {
    label: '이름',
    description: '다른 사람에게 보이는 이름',
    error: '이름을 입력하세요',
    children: control,
  },
};
