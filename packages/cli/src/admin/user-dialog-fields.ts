/** User-specific profile fields and validation shared by the create and edit dialogs. */

import type { AdminCreateUserInput } from './user-service.js';
import type { AdminUserDetail } from './user-state.js';
import { at, Group, Input, Label, signal } from '@jsvision/ui';
import type { DrawContext, Signal, Tab, Validator } from '@jsvision/ui';

/** Signals for the complete editable user profile. */
export interface ProfileSignals {
  readonly givenName: Signal<string>;
  readonly familyName: Signal<string>;
  readonly middleName: Signal<string>;
  readonly nickname: Signal<string>;
  readonly preferredUsername: Signal<string>;
  readonly profileUrl: Signal<string>;
  readonly pictureUrl: Signal<string>;
  readonly websiteUrl: Signal<string>;
  readonly gender: Signal<string>;
  readonly birthdate: Signal<string>;
  readonly zoneinfo: Signal<string>;
  readonly locale: Signal<string>;
  readonly phoneNumber: Signal<string>;
  readonly addressStreet: Signal<string>;
  readonly addressLocality: Signal<string>;
  readonly addressRegion: Signal<string>;
  readonly addressPostalCode: Signal<string>;
  readonly addressCountry: Signal<string>;
}

/** Input that renders only mask characters while retaining its short-lived signal value. */
export class SecretInput extends Input {
  /** Draws the bounded secret as bullets rather than terminal-visible text. */
  draw(context: DrawContext): void {
    const style = context.color(this.state.focused ? 'inputSelected' : 'inputNormal');
    context.fill(' ', style);
    context.text(
      1,
      0,
      '•'.repeat(
        Math.min(this.getValueSignal().peek().length, Math.max(0, context.size.width - 2)),
      ),
      style,
    );
  }
}

/** Returns true when text has no terminal control characters. */
function controlFree(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

/** Creates a validator that preserves ordinary text while enforcing final bounds. */
export function textValidator(minimum: number, maximum: number, optional = true): Validator {
  return {
    isValidInput: (value) => value.length <= maximum && controlFree(value),
    isValid: (value) =>
      controlFree(value) &&
      ((optional && value.length === 0) || (value.length >= minimum && value.length <= maximum)),
  };
}

/** Adds one labelled input row to an absolute-layout group. */
export function addField(
  group: Group,
  label: string,
  input: Input,
  row: number,
  width: number,
): void {
  group.add(at(new Label(label, input), 1, row, 18, 1));
  group.add(at(input, 19, row, Math.max(1, width - 21), 1));
}

/** Creates signals for the complete persisted profile projection. */
export function profileSignals(detail?: AdminUserDetail): ProfileSignals {
  const value = (field: keyof AdminUserDetail): string => {
    const current = detail?.[field];
    return typeof current === 'string' ? current : '';
  };
  return {
    givenName: signal(value('givenName')),
    familyName: signal(value('familyName')),
    middleName: signal(value('middleName')),
    nickname: signal(value('nickname')),
    preferredUsername: signal(value('preferredUsername')),
    profileUrl: signal(value('profileUrl')),
    pictureUrl: signal(value('pictureUrl')),
    websiteUrl: signal(value('websiteUrl')),
    gender: signal(value('gender')),
    birthdate: signal(value('birthdate')),
    zoneinfo: signal(value('zoneinfo')),
    locale: signal(value('locale')),
    phoneNumber: signal(value('phoneNumber')),
    addressStreet: signal(value('addressStreet')),
    addressLocality: signal(value('addressLocality')),
    addressRegion: signal(value('addressRegion')),
    addressPostalCode: signal(value('addressPostalCode')),
    addressCountry: signal(value('addressCountry')),
  };
}

/** Creates a standard bounded profile field. */
export function profileInput(value: Signal<string>, maximum: number): Input {
  return new Input({ value, maxLength: maximum, validator: textValidator(0, maximum) });
}

/** Builds the familiar identity/contact/address tab pages. */
export function profileTabs(values: ProfileSignals, width: number): Tab[] {
  const identity = new Group();
  addField(identity, 'Middle name', profileInput(values.middleName, 255), 1, width);
  addField(identity, 'Nickname', profileInput(values.nickname, 255), 3, width);
  addField(identity, 'Preferred username', profileInput(values.preferredUsername, 255), 5, width);
  addField(identity, 'Gender', profileInput(values.gender, 50), 7, width);
  addField(identity, 'Birthdate', profileInput(values.birthdate, 10), 9, width);

  const contact = new Group();
  addField(contact, 'Profile URL', profileInput(values.profileUrl, 2_048), 1, width);
  addField(contact, 'Picture URL', profileInput(values.pictureUrl, 2_048), 3, width);
  addField(contact, 'Website URL', profileInput(values.websiteUrl, 2_048), 5, width);
  addField(contact, 'Phone', profileInput(values.phoneNumber, 50), 7, width);
  addField(contact, 'Locale', profileInput(values.locale, 10), 9, width);
  addField(contact, 'Time zone', profileInput(values.zoneinfo, 50), 11, width);

  const address = new Group();
  addField(address, 'Street', profileInput(values.addressStreet, 500), 1, width);
  addField(address, 'Locality', profileInput(values.addressLocality, 255), 3, width);
  addField(address, 'Region', profileInput(values.addressRegion, 255), 5, width);
  addField(address, 'Postal code', profileInput(values.addressPostalCode, 20), 7, width);
  addField(address, 'Country', profileInput(values.addressCountry, 2), 9, width);

  return [
    { title: '~P~rofile', content: identity },
    { title: '~C~ontact', content: contact },
    { title: '~A~ddress', content: address },
  ];
}

/** Adds non-empty profile values to a create payload. */
export function addCreateProfile(input: AdminCreateUserInput, values: ProfileSignals): void {
  const assign = <K extends keyof ProfileSignals & keyof AdminCreateUserInput>(key: K): void => {
    const value = values[key].peek();
    if (value) input[key] = value;
  };
  assign('givenName');
  assign('familyName');
  assign('middleName');
  assign('nickname');
  assign('preferredUsername');
  assign('profileUrl');
  assign('pictureUrl');
  assign('websiteUrl');
  assign('gender');
  assign('birthdate');
  assign('zoneinfo');
  assign('locale');
  assign('phoneNumber');
  const address = {
    ...(values.addressStreet.peek() ? { street: values.addressStreet.peek() } : {}),
    ...(values.addressLocality.peek() ? { locality: values.addressLocality.peek() } : {}),
    ...(values.addressRegion.peek() ? { region: values.addressRegion.peek() } : {}),
    ...(values.addressPostalCode.peek() ? { postalCode: values.addressPostalCode.peek() } : {}),
    ...(values.addressCountry.peek() ? { country: values.addressCountry.peek() } : {}),
  };
  if (Object.keys(address).length > 0) input.address = address;
}

/** Validates every mounted input in one dialog. */
export function validInputs(inputs: readonly Input[]): boolean {
  return inputs.every((input) => input.valid());
}
