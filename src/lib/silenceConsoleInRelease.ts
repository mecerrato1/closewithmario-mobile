// Release builds produce no console output. Development builds are unchanged.
// Many screens log lead, phone, email and account details while debugging;
// this keeps them out of device logs on users' phones.
if (!__DEV__) {
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;
  console.trace = noop;
}

export {};
