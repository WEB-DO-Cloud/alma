/** @jsxRuntime automatic */
import type { TransactionalEmail } from "@rakazo/adapter-kit";
import { MOBILE_APP_STORES } from "@rakazo/contracts";
import { Link, Text } from "react-email";
import { emailText, greeting, linkStyle, message } from "./email.js";

const APPS: Readonly<Record<string, string>> = {
  iPhone: MOBILE_APP_STORES.ios,
  Android: MOBILE_APP_STORES.android,
};

export function welcomeEmail(
  user: { email: string; name: string },
  unsubscribeUrl: string,
  locale = "en",
): Promise<TransactionalEmail> {
  const say = emailText(locale);
  return message(
    user.email,
    locale,
    say("Welcome to ALMA"),
    <>
      <Text>{greeting(say, user.name)}</Text>
      <Text>{say("Thanks for signing up for ALMA.")}</Text>
      <Text>
        {say("ALMA also has apps for")}{" "}
        {/* The language's own list ("A, B, and C", "A, B y C"), with each app a link. */}
        {new Intl.ListFormat(locale, { type: "conjunction" })
          .formatToParts(Object.keys(APPS))
          .map((part, index) =>
            part.type === "element" ? (
              <Link key={part.value} href={APPS[part.value]} style={linkStyle}>
                {part.value}
              </Link>
            ) : (
              <span key={`${index}${part.value}`}>{part.value}</span>
            ),
          )}
        .
      </Text>
      <Text>
        {say("Questions or ideas?")}{" "}
        <Link href="https://discord.gg/RWwKa2Sn7h" style={linkStyle}>
          {say("Join us on Discord")}
        </Link>
        .
      </Text>
      <Text>
        {say("Want to run it on your own servers?")}{" "}
        <Link href="https://alma.com.do/self-hosted-ai-agent/" style={linkStyle}>
          {say("Self-host ALMA")}
        </Link>
        .
      </Text>
      <Text>{say("Have any questions? Reply to this email.")}</Text>
      <Text>ALMA</Text>
    </>,
    unsubscribeUrl,
  );
}
