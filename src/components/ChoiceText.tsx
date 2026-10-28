import MathText from '@/components/MathText';
import { choiceLabel, stripChoiceLabel, toText } from '@/lib/textValue';

/**
 * One answer choice shown as "A. 5 + 5i".
 *
 * `choice` may be a plain string or an object such as { id: "A", text: "5 + 5i" };
 * only its text is rendered (never the object itself). The label comes from the choice's
 * position, so it always matches the index that selection, scoring and the answer key use.
 * Khmer text and $LaTeX$ inside the choice are rendered by MathText exactly as before.
 */
export default function ChoiceText({ choice, index }: { choice: unknown; index: number }) {
  const text = stripChoiceLabel(toText(choice), index);
  return (
    <span className="choice-text">
      <span className="choice-label">{choiceLabel(index)}.</span>
      {/* Real space so copied / screen-reader text reads "A. 5 + 5i" (ignored by the flex layout). */}
      {' '}
      <MathText text={text} />
    </span>
  );
}
