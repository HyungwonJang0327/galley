// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { Button } from '../../components/Button';
import { FormField } from '../FormField';
import { Input } from '../Input';
import { Form } from './Form';

const meta = {
  title: 'Primitives/Form',
  component: Form,
};
export default meta;

const fields = (
  <>
    <FormField label="이름" required>
      <Input name="name" />
    </FormField>
    <FormField label="이메일" description="오류는 필드 아래에 뜬다">
      <Input name="email" type="email" />
    </FormField>
    <div>
      <Button type="submit">제출</Button>
    </div>
  </>
);

export const Basic = { args: { 'aria-label': '예시 폼', children: fields } };
export const WithServerErrors = {
  args: { 'aria-label': '예시 폼', errors: { email: '이미 쓰고 있는 주소' }, children: fields },
};
