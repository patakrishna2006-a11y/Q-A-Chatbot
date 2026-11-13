import dotenv
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser

dotenv.load_dotenv()

history = []

llm = ChatNVIDIA(
    model = "nvidia/nemotron-3-ultra-550b-a55b",
    temperature = 0
)

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are an intelligent conversational chatbot.

    Your responsibilities:

    1. Understand the user's current question using conversation history.

    2. If the user asks an incomplete follow-up such as:
       example, why, types, advantages, disadvantages,
       explain more, or how does it work,
       internally convert it into a complete question
       using the previous conversation.

    3. If the question is already independent,
       answer it without changing its meaning.

    4. Answer the interpreted question accurately.

    5. Ask for clarification if the context is insufficient.

    6. Do not unnecessarily repeat previous answers.

    7. Give clear and understandable explanations.

    8. Avoid decorative symbols and emojis.

    Do not display the rewritten question.
    Only provide the final answer.
    """),

    MessagesPlaceholder(variable_name="history"),

    ("human", "{question}")
])

parser = StrOutputParser()

chain = prompt | llm | parser

while True:
    question = input("Enter your question:")
    history.append(HumanMessage(content=question))

    print("\nAssistant: ", end="", flush=True)

    full_response = ""

    for chunk in chain.stream(
        {
            "question": question,
            "history": history
        }
    ):
        if chunk:
            print(chunk, end="", flush=True)
            full_response += chunk 
    print("\n")